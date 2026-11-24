"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireMyStore } from "@/lib/stores";
import { createClient } from "@/lib/supabase/server";
import { parseBRLToCents } from "@/lib/utils";

export type MenuFormState = { ok?: boolean; message?: string };

function refresh(slug: string) {
  revalidatePath("/painel/cardapio", "layout");
  revalidatePath(`/loja/${slug}`);
}

const money = z.string().transform((v, ctx) => {
  const cents = parseBRLToCents(v);
  if (cents === null) {
    ctx.addIssue({ code: "custom", message: "Preço inválido." });
    return z.NEVER;
  }
  return cents;
});
const optionalMoney = z.string().transform((v, ctx) => {
  if (v.trim() === "") return null;
  const cents = parseBRLToCents(v);
  if (cents === null) {
    ctx.addIssue({ code: "custom", message: "Preço inválido." });
    return z.NEVER;
  }
  return cents;
});
const id = z.string().uuid().or(z.literal("")).optional();

// ---------------------------------------------------------------------------
// Categorias
// ---------------------------------------------------------------------------
const categorySchema = z
  .object({
    id,
    name: z.string().trim().min(1, "Informe o nome da categoria.").max(60),
    description: z.string().trim().max(200).optional().default(""),
    active: z.boolean(),
    has_sizes: z.boolean(),
    half_price_rule: z.enum(["highest", "average"]),
    sizes: z
      .array(
        z.object({
          id,
          name: z.string().trim().min(1, "Dê um nome a cada tamanho.").max(30),
          max_flavors: z.number().int().min(1).max(4),
        }),
      )
      .max(10),
    groups: z
      .array(
        z.object({
          id,
          name: z.string().trim().min(1, "Dê um nome a cada grupo de adicionais.").max(60),
          min_select: z.number().int().min(0).max(20),
          max_select: z.number().int().min(1).max(20),
          options: z
            .array(
              z.object({
                id,
                name: z.string().trim().min(1, "Dê um nome a cada opção.").max(60),
                price: money,
                active: z.boolean(),
              }),
            )
            .min(1, "Cada grupo de adicionais precisa de pelo menos uma opção.")
            .max(60),
        }),
      )
      .max(15),
  })
  .superRefine((c, ctx) => {
    if (c.has_sizes && c.sizes.length === 0) {
      ctx.addIssue({ code: "custom", message: "Cadastre pelo menos um tamanho." });
    }
    for (const g of c.groups) {
      if (g.min_select > g.max_select) {
        ctx.addIssue({ code: "custom", message: `No grupo "${g.name}", o mínimo é maior que o máximo.` });
      }
      if (g.min_select > g.options.length) {
        ctx.addIssue({ code: "custom", message: `O grupo "${g.name}" exige mais opções do que tem.` });
      }
    }
  });

export async function saveCategory(_prev: MenuFormState, formData: FormData): Promise<MenuFormState> {
  const { store } = await requireMyStore();
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("payload") ?? "{}"));
  } catch {
    return { message: "Dados inválidos." };
  }
  const parsed = categorySchema.safeParse(raw);
  if (!parsed.success) return { message: parsed.error.issues[0].message };
  const c = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_category", {
    p_store_id: store.id,
    p_category: {
      id: c.id || null,
      name: c.name,
      description: c.description,
      active: c.active,
      has_sizes: c.has_sizes,
      half_price_rule: c.half_price_rule,
      sizes: c.has_sizes ? c.sizes.map((s) => ({ id: s.id || null, name: s.name, max_flavors: s.max_flavors })) : [],
      groups: c.groups.map((g) => ({
        id: g.id || null,
        name: g.name,
        min_select: g.min_select,
        max_select: g.max_select,
        options: g.options.map((o) => ({ id: o.id || null, name: o.name, price_cents: o.price, active: o.active })),
      })),
    },
  });
  if (error) return { message: "Não foi possível salvar a categoria. Tente de novo." };
  refresh(store.slug);
  redirect("/painel/cardapio");
}

export async function deleteCategory(formData: FormData) {
  const { store } = await requireMyStore();
  const supabase = await createClient();
  await supabase.from("categories").delete().eq("id", String(formData.get("id"))).eq("store_id", store.id);
  refresh(store.slug);
  redirect("/painel/cardapio");
}

// ---------------------------------------------------------------------------
// Produtos
// ---------------------------------------------------------------------------
const productSchema = z.object({
  id,
  category_id: z.string().uuid("Escolha a categoria."),
  name: z.string().trim().min(1, "Informe o nome do produto.").max(80),
  description: z.string().trim().max(400, "Descrição com no máximo 400 caracteres.").default(""),
  active: z.boolean(),
  price: optionalMoney,
  prices: z.array(z.object({ size_id: z.string().uuid(), price: optionalMoney })),
  image_url: z.string().nullable(),
});

const IMAGE_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export async function saveProduct(_prev: MenuFormState, formData: FormData): Promise<MenuFormState> {
  const { store } = await requireMyStore();
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("payload") ?? "{}"));
  } catch {
    return { message: "Dados inválidos." };
  }
  const parsed = productSchema.safeParse(raw);
  if (!parsed.success) return { message: parsed.error.issues[0].message };
  const p = parsed.data;

  const supabase = await createClient();
  const { data: category } = await supabase
    .from("categories")
    .select("has_sizes")
    .eq("id", p.category_id)
    .eq("store_id", store.id)
    .maybeSingle();
  if (!category) return { message: "Categoria não encontrada." };
  if (category.has_sizes && !p.prices.some((x) => x.price !== null)) {
    return { message: "Informe o preço de pelo menos um tamanho." };
  }
  if (!category.has_sizes && p.price === null) return { message: "Informe o preço." };

  let imageUrl = p.image_url;
  const file = formData.get("image");
  if (file instanceof File && file.size > 0) {
    const ext = IMAGE_TYPES[file.type];
    if (!ext) return { message: "Use uma foto PNG, JPG ou WEBP." };
    if (file.size > 5 * 1024 * 1024) return { message: "A foto precisa ter no máximo 5 MB." };
    const path = `${store.id}/produtos/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("store-assets").upload(path, file, { contentType: file.type });
    if (error) return { message: "Não foi possível enviar a foto. Tente de novo." };
    imageUrl = supabase.storage.from("store-assets").getPublicUrl(path).data.publicUrl;
  }

  const { error } = await supabase.rpc("save_product", {
    p_store_id: store.id,
    p_product: {
      id: p.id || null,
      category_id: p.category_id,
      name: p.name,
      description: p.description,
      image_url: imageUrl,
      active: p.active,
      price_cents: category.has_sizes ? null : p.price,
      prices: category.has_sizes
        ? p.prices.filter((x) => x.price !== null).map((x) => ({ size_id: x.size_id, price_cents: x.price }))
        : [],
    },
  });
  if (error) return { message: "Não foi possível salvar o produto. Tente de novo." };
  refresh(store.slug);
  redirect("/painel/cardapio");
}

export async function deleteProduct(formData: FormData) {
  const { store } = await requireMyStore();
  const supabase = await createClient();
  await supabase.from("products").delete().eq("id", String(formData.get("id"))).eq("store_id", store.id);
  refresh(store.slug);
  redirect("/painel/cardapio");
}

// ---------------------------------------------------------------------------
// Ações rápidas da lista
// ---------------------------------------------------------------------------
export async function setActive(kind: "product" | "category", itemId: string, active: boolean) {
  const { store } = await requireMyStore();
  const supabase = await createClient();
  await supabase
    .from(kind === "product" ? "products" : "categories")
    .update({ active })
    .eq("id", itemId)
    .eq("store_id", store.id);
  refresh(store.slug);
}

/** Altera um preço direto na lista. sizeId null = preço único. */
export async function updatePrice(productId: string, sizeId: string | null, value: string) {
  const { store } = await requireMyStore();
  const cents = parseBRLToCents(value);
  if (cents === null) return { ok: false, message: "Preço inválido." };
  const supabase = await createClient();
  const { error } = sizeId
    ? await supabase
        .from("product_prices")
        .upsert({ product_id: productId, size_id: sizeId, store_id: store.id, price_cents: cents })
    : await supabase.from("products").update({ price_cents: cents }).eq("id", productId).eq("store_id", store.id);
  if (error) return { ok: false, message: "Não foi possível salvar." };
  refresh(store.slug);
  return { ok: true, cents };
}

/** Sobe ou desce uma categoria ou produto na ordem do cardápio. */
export async function move(kind: "product" | "category", itemId: string, direction: "up" | "down") {
  const { store } = await requireMyStore();
  const supabase = await createClient();
  const table = kind === "product" ? "products" : "categories";

  const { data: item } = await supabase.from(table).select("*").eq("id", itemId).eq("store_id", store.id).maybeSingle();
  if (!item) return;
  let query = supabase.from(table).select("id, sort_order").eq("store_id", store.id);
  if (kind === "product") query = query.eq("category_id", item.category_id);
  const { data: siblings } = await query.order("sort_order").order("created_at");
  if (!siblings) return;

  const index = siblings.findIndex((s) => s.id === itemId);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= siblings.length) return;
  const reordered = [...siblings];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];

  await Promise.all(
    reordered.map((s, i) =>
      s.sort_order === i ? null : supabase.from(table).update({ sort_order: i }).eq("id", s.id).eq("store_id", store.id),
    ),
  );
  refresh(store.slug);
}
