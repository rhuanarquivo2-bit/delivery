"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireMyStore } from "@/lib/stores";
import { createClient } from "@/lib/supabase/server";
import { parseBRLToCents } from "@/lib/utils";

export type FormState = { message?: string };

function refresh(slug: string) {
  revalidatePath("/painel/promocoes", "layout");
  revalidatePath(`/loja/${slug}`, "layout");
}

const optionalText = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : null));

const promotionSchema = z
  .object({
    id: z.string().uuid().or(z.literal("")),
    name: z.string().trim().min(1, "Dê um nome para a promoção.").max(60),
    target: z.string().regex(/^[pc]:[0-9a-f-]{36}$/, "Escolha em qual produto ou categoria vale a promoção."),
    kind: z.enum(["percent", "fixed"]),
    value: z.string(),
    weekdays: z.array(z.coerce.number().int().min(0).max(6)),
    start_time: optionalText,
    end_time: optionalText,
    starts_on: optionalText,
    ends_on: optionalText,
    active: z.boolean(),
  })
  .transform((v, ctx) => {
    let value: number | null;
    if (v.kind === "percent") {
      value = Number(v.value.replace(",", "."));
      if (!Number.isInteger(value) || value < 1 || value > 90) {
        ctx.addIssue({ code: "custom", message: "A porcentagem precisa ser um número inteiro de 1 a 90." });
        return z.NEVER;
      }
    } else {
      value = parseBRLToCents(v.value);
      if (!value) {
        ctx.addIssue({ code: "custom", message: "Informe o valor do desconto em reais." });
        return z.NEVER;
      }
    }
    if (Boolean(v.start_time) !== Boolean(v.end_time)) {
      ctx.addIssue({ code: "custom", message: "Preencha o horário de início e de fim, ou deixe os dois vazios." });
      return z.NEVER;
    }
    if (v.start_time && v.start_time === v.end_time) {
      ctx.addIssue({ code: "custom", message: "O horário de início e de fim não podem ser iguais." });
      return z.NEVER;
    }
    if (v.starts_on && v.ends_on && v.ends_on < v.starts_on) {
      ctx.addIssue({ code: "custom", message: "A data final precisa ser depois da inicial." });
      return z.NEVER;
    }
    const [type, targetId] = v.target.split(":");
    return {
      id: v.id,
      row: {
        name: v.name,
        kind: v.kind,
        value,
        product_id: type === "p" ? targetId : null,
        category_id: type === "c" ? targetId : null,
        // nenhum dia marcado ou todos = vale todos os dias
        weekdays: v.weekdays.length === 0 || v.weekdays.length === 7 ? null : [...new Set(v.weekdays)].sort(),
        start_time: v.start_time,
        end_time: v.end_time,
        starts_on: v.starts_on,
        ends_on: v.ends_on,
        active: v.active,
      },
    };
  });

export async function savePromotion(_: FormState, formData: FormData): Promise<FormState> {
  const { store } = await requireMyStore();
  const parsed = promotionSchema.safeParse({
    id: String(formData.get("id") ?? ""),
    name: formData.get("name"),
    target: formData.get("target"),
    kind: formData.get("kind"),
    value: String(formData.get("value") ?? ""),
    weekdays: formData.getAll("weekdays").map(String),
    start_time: String(formData.get("start_time") ?? ""),
    end_time: String(formData.get("end_time") ?? ""),
    starts_on: String(formData.get("starts_on") ?? ""),
    ends_on: String(formData.get("ends_on") ?? ""),
    active: formData.get("active") === "on",
  });
  if (!parsed.success) return { message: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { id, row } = parsed.data;
  const { error } = id
    ? await supabase.from("promotions").update(row).eq("id", id).eq("store_id", store.id)
    : await supabase.from("promotions").insert({ ...row, store_id: store.id });
  if (error) return { message: "Não foi possível salvar a promoção. Tente de novo." };

  refresh(store.slug);
  redirect("/painel/promocoes");
}

export async function setPromotionActive(id: string, active: boolean) {
  const { store } = await requireMyStore();
  const supabase = await createClient();
  await supabase.from("promotions").update({ active }).eq("id", id).eq("store_id", store.id);
  refresh(store.slug);
}

export async function deletePromotion(formData: FormData) {
  const { store } = await requireMyStore();
  const supabase = await createClient();
  await supabase.from("promotions").delete().eq("id", String(formData.get("id"))).eq("store_id", store.id);
  refresh(store.slug);
  redirect("/painel/promocoes");
}
