"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireMyStore } from "@/lib/stores";
import { createClient } from "@/lib/supabase/server";
import { parseBRLToCents } from "@/lib/utils";

export type FormState = { message?: string };

const optionalMoney = (label: string) =>
  z.string().transform((v, ctx) => {
    if (!v.trim()) return null;
    const cents = parseBRLToCents(v);
    if (cents === null) {
      ctx.addIssue({ code: "custom", message: `${label} inválido.` });
      return z.NEVER;
    }
    return cents;
  });

const optionalCount = (label: string) =>
  z.string().transform((v, ctx) => {
    if (!v.trim()) return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1) {
      ctx.addIssue({ code: "custom", message: `${label}: use um número inteiro maior que zero.` });
      return z.NEVER;
    }
    return n;
  });

const date = z
  .string()
  .regex(/^(\d{4}-\d{2}-\d{2})?$/)
  .transform((v) => v || null);

/** Datas do formulário valem no horário de Brasília: início às 00:00, fim às 23:59 do dia. */
const startOfDay = (d: string) => `${d}T00:00:00-03:00`;
const endOfDay = (d: string) => {
  const next = new Date(`${d}T00:00:00-03:00`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
};

const couponSchema = z
  .object({
    id: z.string().uuid().or(z.literal("")),
    code: z
      .string()
      .transform((v) => v.trim().toUpperCase())
      .pipe(
        z
          .string()
          .regex(/^[A-Z0-9_-]{3,20}$/, "O código precisa ter de 3 a 20 letras, números, - ou _ (sem espaço nem acento)."),
      ),
    description: z.string().trim().max(120),
    kind: z.enum(["percent", "fixed", "free_delivery"]),
    value: z.string(),
    max_discount: optionalMoney("Desconto máximo"),
    min_order: optionalMoney("Pedido mínimo"),
    usage_limit: optionalCount("Limite de usos"),
    per_customer_limit: optionalCount("Usos por cliente"),
    first_order_only: z.boolean(),
    starts_on: date,
    ends_on: date,
    active: z.boolean(),
  })
  .transform((v, ctx) => {
    let value = 0;
    if (v.kind === "percent") {
      value = Number(v.value.replace(",", "."));
      if (!Number.isInteger(value) || value < 1 || value > 100) {
        ctx.addIssue({ code: "custom", message: "A porcentagem precisa ser um número inteiro de 1 a 100." });
        return z.NEVER;
      }
    } else if (v.kind === "fixed") {
      const cents = parseBRLToCents(v.value);
      if (!cents) {
        ctx.addIssue({ code: "custom", message: "Informe o valor do desconto em reais." });
        return z.NEVER;
      }
      value = cents;
    }
    if (v.starts_on && v.ends_on && v.ends_on < v.starts_on) {
      ctx.addIssue({ code: "custom", message: "A data final precisa ser depois da inicial." });
      return z.NEVER;
    }
    return {
      id: v.id,
      row: {
        code: v.code,
        description: v.description || null,
        kind: v.kind,
        value,
        max_discount_cents: v.kind === "percent" ? v.max_discount : null,
        min_order_cents: v.min_order ?? 0,
        usage_limit: v.usage_limit,
        per_customer_limit: v.per_customer_limit,
        first_order_only: v.first_order_only,
        starts_at: v.starts_on ? startOfDay(v.starts_on) : null,
        ends_at: v.ends_on ? endOfDay(v.ends_on) : null,
        active: v.active,
      },
    };
  });

export async function saveCoupon(_: FormState, formData: FormData): Promise<FormState> {
  const { store } = await requireMyStore();
  const text = (name: string) => String(formData.get(name) ?? "");
  const parsed = couponSchema.safeParse({
    id: text("id"),
    code: text("code"),
    description: text("description"),
    kind: text("kind"),
    value: text("value"),
    max_discount: text("max_discount"),
    min_order: text("min_order"),
    usage_limit: text("usage_limit"),
    per_customer_limit: text("per_customer_limit"),
    first_order_only: formData.get("first_order_only") === "on",
    starts_on: text("starts_on"),
    ends_on: text("ends_on"),
    active: formData.get("active") === "on",
  });
  if (!parsed.success) return { message: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { id, row } = parsed.data;
  const { error } = id
    ? await supabase.from("coupons").update(row).eq("id", id).eq("store_id", store.id)
    : await supabase.from("coupons").insert({ ...row, store_id: store.id });
  if (error) {
    if (error.code === "23505") return { message: `Já existe um cupom com o código ${row.code}.` };
    return { message: "Não foi possível salvar o cupom. Tente de novo." };
  }

  revalidatePath("/painel/cupons", "layout");
  redirect("/painel/cupons");
}

export async function setCouponActive(id: string, active: boolean) {
  const { store } = await requireMyStore();
  const supabase = await createClient();
  await supabase.from("coupons").update({ active }).eq("id", id).eq("store_id", store.id);
  revalidatePath("/painel/cupons", "layout");
}

export async function deleteCoupon(formData: FormData) {
  const { store } = await requireMyStore();
  const supabase = await createClient();
  await supabase.from("coupons").delete().eq("id", String(formData.get("id"))).eq("store_id", store.id);
  revalidatePath("/painel/cupons", "layout");
  redirect("/painel/cupons");
}
