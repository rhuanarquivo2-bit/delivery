"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireMyStore } from "@/lib/stores";
import { createClient } from "@/lib/supabase/server";
import type { CourierDay, Order } from "@/lib/types";
import { parseBRLToCents } from "@/lib/utils";

export type FormState = { message?: string };

const money = (label: string) =>
  z.string().transform((v, ctx) => {
    if (!v.trim()) return 0;
    const cents = parseBRLToCents(v);
    if (cents === null || cents > 1000000) {
      ctx.addIssue({ code: "custom", message: `${label} inválido.` });
      return z.NEVER;
    }
    return cents;
  });

const courierSchema = z
  .object({
    id: z.string().uuid().or(z.literal("")),
    name: z.string().trim().min(2, "Informe o nome do motoboy.").max(60),
    phone: z
      .string()
      .transform((v) => v.replace(/\D/g, ""))
      .refine((v) => v === "" || (v.length >= 10 && v.length <= 13), "Celular com DDD, ex.: (11) 99999-0000.")
      .transform((v) => v || null),
    pix_key: z
      .string()
      .trim()
      .max(120)
      .transform((v) => v || null),
    fee_mode: z.enum(["fixed", "zone_fee"]),
    fee: money("Valor por entrega"),
    daily_rate: money("Diária"),
    active: z.boolean(),
  })
  .refine((v) => v.fee_mode === "zone_fee" || v.fee > 0 || v.daily_rate > 0, {
    message: "Informe quanto o motoboy ganha por entrega (ou a diária).",
  });

export async function saveCourier(_: FormState, formData: FormData): Promise<FormState> {
  const { store } = await requireMyStore();
  const text = (name: string) => String(formData.get(name) ?? "");
  const parsed = courierSchema.safeParse({
    id: text("id"),
    name: text("name"),
    phone: text("phone"),
    pix_key: text("pix_key"),
    fee_mode: text("fee_mode"),
    fee: text("fee"),
    daily_rate: text("daily_rate"),
    active: formData.get("active") === "on",
  });
  if (!parsed.success) return { message: parsed.error.issues[0].message };
  const { id, fee, daily_rate, ...rest } = parsed.data;
  const row = { ...rest, fee_cents: rest.fee_mode === "fixed" ? fee : 0, daily_rate_cents: daily_rate };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("couriers").update(row).eq("id", id).eq("store_id", store.id)
    : await supabase.from("couriers").insert({ ...row, store_id: store.id });
  if (error) return { message: "Não foi possível salvar o motoboy. Tente de novo." };

  revalidatePath("/painel/motoboys", "layout");
  revalidatePath("/painel/pedidos");
  redirect("/painel/motoboys");
}

export async function setCourierActive(id: string, active: boolean) {
  const { store } = await requireMyStore();
  const supabase = await createClient();
  await supabase.from("couriers").update({ active }).eq("id", id).eq("store_id", store.id);
  revalidatePath("/painel/motoboys", "layout");
  revalidatePath("/painel/pedidos");
}

/** Gera um link novo para o site do motoboy. O antigo para de funcionar na hora. */
export async function regenerateCourierLink(id: string) {
  const { store } = await requireMyStore();
  const supabase = await createClient();
  const { data } = await supabase
    .from("couriers")
    .update({ access_token: crypto.randomUUID() })
    .eq("id", id)
    .eq("store_id", store.id)
    .select("access_token")
    .maybeSingle();
  revalidatePath("/painel/motoboys", "layout");
  return data?.access_token as string | undefined;
}

const ASSIGN_ERRORS: Record<string, string> = {
  pedido_retirada: "Pedido de retirada não vai com motoboy.",
  pedido_encerrado: "Esse pedido já foi encerrado.",
  motoboy_invalido: "Motoboy não encontrado ou desativado.",
};

export async function assignCourier(orderId: string, courierId: string | null) {
  await requireMyStore();
  if (!z.string().uuid().safeParse(orderId).success) return { ok: false as const, message: "Pedido inválido." };
  if (courierId !== null && !z.string().uuid().safeParse(courierId).success) {
    return { ok: false as const, message: "Motoboy inválido." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("assign_courier", { p_order_id: orderId, p_courier_id: courierId });
  if (error) return { ok: false as const, message: ASSIGN_ERRORS[error.message] ?? "Não foi possível escolher o motoboy." };
  revalidatePath("/painel/pedidos");
  return { ok: true as const, order: data as Order };
}

export async function setCourierPayout(courierId: string, day: string, paid: boolean) {
  await requireMyStore();
  if (!z.string().uuid().safeParse(courierId).success || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return { ok: false as const, message: "Dados inválidos." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_courier_payout", { p_courier_id: courierId, p_day: day, p_paid: paid });
  if (error) return { ok: false as const, message: "Não foi possível atualizar o acerto." };
  revalidatePath("/painel/motoboys");
  return { ok: true as const, day: data as CourierDay };
}
