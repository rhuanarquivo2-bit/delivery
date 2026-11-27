"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getMyStore, requireMyStore, requireUser } from "@/lib/stores";
import { createClient } from "@/lib/supabase/server";
import { parseBRLToCents, SLUG_PATTERN, slugify } from "@/lib/utils";

export type FormState = { ok?: boolean; message?: string; errors?: Record<string, string> };

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use no máximo ${max} caracteres.`)
    .transform((v) => (v === "" ? null : v));

const phone = z
  .string()
  .trim()
  .transform((v) => v.replace(/\D/g, ""))
  .refine((v) => v === "" || (v.length >= 10 && v.length <= 13), "Telefone com DDD, só números.")
  .transform((v) => (v === "" ? null : v));

const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Escolha uma cor válida.");

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .refine((v) => SLUG_PATTERN.test(v), "Use de 3 a 40 letras minúsculas, números ou hífens.");

function fieldErrors(error: z.ZodError): FormState {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    errors[key] ??= issue.message;
  }
  return { errors, message: "Revise os campos destacados." };
}

// ---------------------------------------------------------------------------
// Criar a loja (primeiro acesso)
// ---------------------------------------------------------------------------
const createSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da loja.").max(80),
  slug,
  whatsapp: phone,
  primary_color: color,
});

export async function createStore(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (user.isAnonymous) return { message: "Na demonstração não dá para criar loja. Crie sua conta primeiro." };
  if (await getMyStore()) redirect("/painel");

  const raw = Object.fromEntries(formData);
  const parsed = createSchema.safeParse({ ...raw, slug: raw.slug || slugify(String(raw.name ?? "")) });
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.from("stores").insert({ ...parsed.data, phone: parsed.data.whatsapp });
  if (error) {
    if (error.code === "23505") return { errors: { slug: "Esse endereço já está em uso. Escolha outro." } };
    return { message: "Não foi possível criar a loja. Tente de novo." };
  }
  revalidatePath("/painel", "layout");
  redirect("/painel/loja?criada=1");
}

// ---------------------------------------------------------------------------
// Dados da loja
// ---------------------------------------------------------------------------
const infoSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da loja.").max(80),
  slug,
  description: optionalText(280),
  phone,
  whatsapp: phone,
  address_street: optionalText(120),
  address_number: optionalText(20),
  address_district: optionalText(80),
  address_city: optionalText(80),
  address_state: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === "" || /^[A-Z]{2}$/.test(v), "Use a sigla, ex.: SP.")
    .transform((v) => (v === "" ? null : v)),
  primary_color: color,
  min_order: z.string().transform((v, ctx) => {
    if (v.trim() === "") return 0;
    const cents = parseBRLToCents(v);
    if (cents === null) {
      ctx.addIssue({ code: "custom", message: "Valor inválido." });
      return z.NEVER;
    }
    return cents;
  }),
  prep_time_minutes: z.coerce.number().int().min(5, "Mínimo de 5 minutos.").max(240, "Máximo de 240 minutos."),
});

export async function updateStoreInfo(_prev: FormState, formData: FormData): Promise<FormState> {
  const { store } = await requireMyStore();
  const parsed = infoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrors(parsed.error);

  const { min_order, ...rest } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("stores")
    .update({ ...rest, min_order_cents: min_order })
    .eq("id", store.id);
  if (error) {
    if (error.code === "23505") return { errors: { slug: "Esse endereço já está em uso. Escolha outro." } };
    return { message: "Não foi possível salvar. Tente de novo." };
  }
  revalidatePath("/painel", "layout");
  revalidatePath(`/loja/${store.slug}`);
  revalidatePath(`/loja/${rest.slug}`);
  return { ok: true, message: "Dados da loja salvos." };
}

// ---------------------------------------------------------------------------
// Site e pedidos: agendamento, janela de promoções, impressão e marketing
// ---------------------------------------------------------------------------
const checkbox = z
  .string()
  .optional()
  .transform((v) => v === "on");

const optionalId = z
  .string()
  .optional()
  .transform((v) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : null));

const siteSchema = z.object({
  pix_whatsapp_enabled: checkbox,
  accepts_scheduled: checkbox,
  schedule_days_ahead: z.coerce.number().int().min(0, "De 0 a 7 dias.").max(7, "De 0 a 7 dias."),
  show_promo_popup: checkbox,
  print_kitchen_copy: checkbox,
  facebook_pixel_id: z
    .string()
    .trim()
    .refine((v) => v === "" || /^[0-9]{6,20}$/.test(v), "O ID do Pixel tem só números (ex.: 123456789012345).")
    .transform((v) => (v === "" ? null : v)),
  google_analytics_id: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === "" || /^G-[A-Z0-9]{4,16}$/.test(v), "O ID do Analytics começa com G- (ex.: G-AB12CD34EF).")
    .transform((v) => (v === "" ? null : v)),
  upsell_enabled: checkbox,
  upsell_1: optionalId,
  upsell_2: optionalId,
  upsell_3: optionalId,
});

export async function updateSiteSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const { store } = await requireMyStore();
  const parsed = siteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrors(parsed.error);
  const { upsell_1, upsell_2, upsell_3, ...data } = parsed.data;

  const supabase = await createClient();
  // sugestões fixas: até 3, sem repetir, só produtos desta loja
  const wanted = [...new Set([upsell_1, upsell_2, upsell_3].filter((id): id is string => Boolean(id)))];
  let upsell_product_ids: string[] = [];
  if (wanted.length) {
    const { data: found } = await supabase.from("products").select("id").eq("store_id", store.id).in("id", wanted);
    const ok = new Set((found ?? []).map((p) => p.id as string));
    upsell_product_ids = wanted.filter((id) => ok.has(id));
  }
  const { error } = await supabase
    .from("stores")
    .update({ ...data, upsell_product_ids })
    .eq("id", store.id);
  if (error) return { message: "Não foi possível salvar. Tente de novo." };
  revalidatePath("/painel", "layout");
  revalidatePath(`/loja/${store.slug}`, "layout");
  return { ok: true, message: "Configurações do site salvas." };
}

// ---------------------------------------------------------------------------
// Logo
// ---------------------------------------------------------------------------
const LOGO_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const LOGO_MAX_BYTES = 5 * 1024 * 1024;

export async function uploadLogo(_prev: FormState, formData: FormData): Promise<FormState> {
  const { store } = await requireMyStore();
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) return { message: "Escolha uma imagem." };
  const ext = LOGO_TYPES[file.type];
  if (!ext) return { message: "Use uma imagem PNG, JPG ou WEBP." };
  if (file.size > LOGO_MAX_BYTES) return { message: "A imagem precisa ter no máximo 5 MB." };

  const supabase = await createClient();
  const path = `${store.id}/logo-${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from("store-assets")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) return { message: "Não foi possível enviar a imagem. Tente de novo." };

  const { data } = supabase.storage.from("store-assets").getPublicUrl(path);
  const { error } = await supabase.from("stores").update({ logo_url: data.publicUrl }).eq("id", store.id);
  if (error) return { message: "A imagem foi enviada, mas não foi possível salvar. Tente de novo." };

  // Remove o logo anterior para não acumular arquivos.
  const previous = store.logo_url?.split("/store-assets/")[1];
  if (previous) await supabase.storage.from("store-assets").remove([decodeURIComponent(previous)]);

  revalidatePath("/painel", "layout");
  revalidatePath(`/loja/${store.slug}`);
  return { ok: true, message: "Logo atualizado." };
}

// ---------------------------------------------------------------------------
// Horários
// ---------------------------------------------------------------------------
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido.");

export async function saveHours(_prev: FormState, formData: FormData): Promise<FormState> {
  const { store } = await requireMyStore();
  const rows: { weekday: number; opens_at: string; closes_at: string }[] = [];
  const errors: Record<string, string> = {};

  for (let weekday = 0; weekday < 7; weekday++) {
    if (formData.get(`open-${weekday}`) !== "on") continue;
    const opens = time.safeParse(formData.get(`opens-${weekday}`));
    const closes = time.safeParse(formData.get(`closes-${weekday}`));
    if (!opens.success || !closes.success) {
      errors[`day-${weekday}`] = "Preencha abertura e fechamento.";
      continue;
    }
    if (opens.data === closes.data) {
      errors[`day-${weekday}`] = "Abertura e fechamento não podem ser iguais.";
      continue;
    }
    rows.push({ weekday, opens_at: opens.data, closes_at: closes.data });
  }
  if (Object.keys(errors).length) return { errors, message: "Revise os horários destacados." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("replace_store_hours", {
    p_store_id: store.id,
    p_rows: rows.map(({ weekday, opens_at, closes_at }) => ({ weekday, opens_at, closes_at })),
  });
  if (error) return { message: "Não foi possível salvar os horários. Tente de novo." };
  revalidatePath("/painel", "layout");
  revalidatePath(`/loja/${store.slug}`);
  return { ok: true, message: "Horários salvos." };
}

// ---------------------------------------------------------------------------
// Bairros e taxas de entrega
// ---------------------------------------------------------------------------
const zonesSchema = z.object({
  zones: z
    .array(
      z.object({
        neighborhood: z.string().trim().min(2, "Informe o bairro.").max(80),
        fee: z.string(),
        active: z.boolean(),
        aliases: z.string().max(600, "Outros nomes: texto grande demais.").default(""),
      }),
    )
    .max(300, "Máximo de 300 bairros."),
  // bairro que não está na lista: null = não entrega; texto = taxa cobrada
  other_fee: z.string().nullable().default(null),
});

/** Nome da linha especial "outros bairros" (o cliente vê o bairro dele, não este nome). */
const OTHER_ZONE_NAME = "Outros bairros";

export async function saveZones(_prev: FormState, formData: FormData): Promise<FormState> {
  const { store } = await requireMyStore();
  let input: unknown;
  try {
    input = JSON.parse(String(formData.get("zones") ?? "{}"));
  } catch {
    return { message: "Dados inválidos." };
  }
  // formato antigo (só a lista) ainda é aceito
  if (Array.isArray(input)) input = { zones: input };
  const parsed = zonesSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue.path[0] === "zones" && typeof issue.path[1] === "number") {
      return { message: `Linha ${issue.path[1] + 1}: ${issue.message}` };
    }
    return { message: issue.message };
  }

  const seen = new Set<string>();
  const rows = [];
  for (const [i, zone] of parsed.data.zones.entries()) {
    const fee = zone.fee.trim() === "" ? 0 : parseBRLToCents(zone.fee);
    if (fee === null) return { message: `Linha ${i + 1}: taxa inválida.` };
    const key = zone.neighborhood.toLocaleLowerCase("pt-BR");
    if (key === OTHER_ZONE_NAME.toLocaleLowerCase("pt-BR")) {
      return { message: `"${OTHER_ZONE_NAME}" é reservado. Use a opção "Bairro que não está na lista" abaixo.` };
    }
    if (seen.has(key)) return { message: `O bairro "${zone.neighborhood}" aparece duas vezes.` };
    seen.add(key);
    const aliases = zone.aliases
      .split(/[,;\n]/)
      .map((a) => a.trim())
      .filter((a) => a.length >= 2)
      .slice(0, 20);
    rows.push({
      neighborhood: zone.neighborhood,
      fee_cents: fee,
      active: zone.active,
      sort_order: i,
      aliases,
      catch_all: false,
    });
  }

  if (parsed.data.other_fee !== null) {
    const fee = parsed.data.other_fee.trim() === "" ? 0 : parseBRLToCents(parsed.data.other_fee);
    if (fee === null) return { message: "Taxa para bairros fora da lista inválida." };
    rows.push({
      neighborhood: OTHER_ZONE_NAME,
      fee_cents: fee,
      active: true,
      sort_order: rows.length,
      aliases: [],
      catch_all: true,
    });
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("replace_delivery_zones", { p_store_id: store.id, p_rows: rows });
  if (error) return { message: "Não foi possível salvar os bairros. Tente de novo." };
  revalidatePath("/painel", "layout");
  revalidatePath(`/loja/${store.slug}`);
  return { ok: true, message: "Bairros e taxas salvos." };
}

// ---------------------------------------------------------------------------
// Abrir / fechar manualmente
// ---------------------------------------------------------------------------
export async function setOpenOverride(formData: FormData) {
  const { store } = await requireMyStore();
  const value = formData.get("override");
  const override = value === "open" ? true : value === "closed" ? false : null;
  const supabase = await createClient();
  await supabase.from("stores").update({ open_override: override }).eq("id", store.id);
  revalidatePath("/painel", "layout");
  revalidatePath(`/loja/${store.slug}`);
}
