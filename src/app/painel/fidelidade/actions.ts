"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMyStore } from "@/lib/stores";
import { createClient } from "@/lib/supabase/server";
import { parseBRLToCents } from "@/lib/utils";

export type FormState = { ok?: boolean; message?: string };

const settingsSchema = z.object({
  loyalty_enabled: z
    .string()
    .optional()
    .transform((v) => v === "on"),
  money_per_point: z.string().transform((v, ctx) => {
    const cents = parseBRLToCents(v);
    if (cents === null || cents < 1 || cents > 100000) {
      ctx.addIssue({ code: "custom", message: "Informe quanto o cliente gasta para ganhar 1 ponto (ex.: 1,00)." });
      return z.NEVER;
    }
    return cents;
  }),
  loyalty_welcome_points: z.coerce.number({ message: "Pontos de boas-vindas inválidos." }).int().min(0, "Use 0 ou mais.").max(100000),
  loyalty_expiry_days: z.coerce.number().int().min(7, "Validade entre 7 e 730 dias.").max(730, "Validade entre 7 e 730 dias."),
});

export async function saveLoyaltySettings(_: FormState, formData: FormData): Promise<FormState> {
  const { store } = await requireMyStore();
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { message: parsed.error.issues[0].message };
  const { money_per_point, ...rest } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("stores")
    .update({ ...rest, loyalty_cents_per_point: money_per_point })
    .eq("id", store.id);
  if (error) return { message: "Não foi possível salvar. Tente de novo." };
  revalidatePath("/painel/fidelidade");
  revalidatePath(`/loja/${store.slug}`, "layout");
  return { ok: true, message: "Programa de fidelidade salvo." };
}

const rewardSchema = z
  .object({
    name: z.string().trim().min(2, "Dê um nome para a recompensa.").max(60),
    points_cost: z.coerce.number({ message: "Informe os pontos." }).int().min(1, "Use 1 ponto ou mais.").max(1000000),
    kind: z.enum(["product", "percent"]),
    product_id: z.string().optional(),
    percent: z.string().optional(),
  })
  .transform((v, ctx) => {
    if (v.kind === "product") {
      if (!v.product_id || !/^[0-9a-f-]{36}$/i.test(v.product_id)) {
        ctx.addIssue({ code: "custom", message: "Escolha o produto grátis." });
        return z.NEVER;
      }
      return { name: v.name, points_cost: v.points_cost, kind: v.kind, product_id: v.product_id, percent: null };
    }
    const pct = Number(v.percent);
    if (!Number.isInteger(pct) || pct < 1 || pct > 100) {
      ctx.addIssue({ code: "custom", message: "Desconto entre 1% e 100%." });
      return z.NEVER;
    }
    return { name: v.name, points_cost: v.points_cost, kind: v.kind, product_id: null, percent: pct };
  });

export async function addReward(_: FormState, formData: FormData): Promise<FormState> {
  const { store } = await requireMyStore();
  const parsed = rewardSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { message: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.from("loyalty_rewards").insert({ ...parsed.data, store_id: store.id });
  if (error) return { message: "Não foi possível salvar a recompensa. Tente de novo." };
  revalidatePath("/painel/fidelidade");
  return { ok: true, message: "Recompensa criada." };
}

export async function setRewardActive(id: string, active: boolean) {
  const { store } = await requireMyStore();
  const supabase = await createClient();
  await supabase.from("loyalty_rewards").update({ active }).eq("id", id).eq("store_id", store.id);
  revalidatePath("/painel/fidelidade");
}

export async function deleteReward(formData: FormData) {
  const { store } = await requireMyStore();
  const supabase = await createClient();
  await supabase.from("loyalty_rewards").delete().eq("id", String(formData.get("id"))).eq("store_id", store.id);
  revalidatePath("/painel/fidelidade");
}
