"use server";

import { z } from "zod";
import { kitchenErrorText } from "@/lib/kitchen";
import { later, notifyOrderStatus } from "@/lib/push/notify";
import { requireMyStore } from "@/lib/stores";
import { createClient } from "@/lib/supabase/server";

const statusSchema = z.object({
  orderId: z.string().uuid(),
  status: z.enum(["preparing", "ready"]),
  token: z.string().uuid().nullable(),
  /** Voltar de pronto para o preparo: não avisa o cliente de novo. */
  undo: z.boolean().optional(),
});

/**
 * Cozinha aceita, marca pronto ou volta para o preparo. Passa pelo servidor para avisar o
 * cliente no celular (notificação), igual ao painel de pedidos.
 */
export async function kitchenSetStatus(input: z.input<typeof statusSchema>) {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, message: "Dados inválidos." };
  const { orderId, status, token, undo } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("kitchen_update", {
    p_order_id: orderId,
    p_status: status,
    p_token: token,
  });
  if (error || !data) {
    return { ok: false as const, code: error?.message, message: kitchenErrorText(error?.message) };
  }
  if (!undo) later(() => notifyOrderStatus(orderId));
  return { ok: true as const };
}

/** Cria o link da cozinha ou troca por um novo (o antigo para de funcionar). */
export async function rotateKitchenLink() {
  const { store } = await requireMyStore();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("kitchen_link_rotate", { p_store_id: store.id });
  if (error || !data) return { ok: false as const, message: "Não foi possível criar o link." };
  return { ok: true as const, token: data as string };
}

/** Desliga o link da cozinha. */
export async function disableKitchenLink() {
  const { store } = await requireMyStore();
  const supabase = await createClient();
  const { error } = await supabase.rpc("kitchen_link_disable", { p_store_id: store.id });
  if (error) return { ok: false as const, message: "Não foi possível desligar o link." };
  return { ok: true as const };
}

/** Tempo alvo da cozinha (minutos): passou disso, o pedido fica vermelho. */
export async function setKitchenTarget(minutes: number) {
  const { store } = await requireMyStore();
  const parsed = z.number().int().min(5).max(120).safeParse(minutes);
  if (!parsed.success) return { ok: false as const, message: "Use de 5 a 120 minutos." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("stores")
    .update({ kitchen_target_minutes: parsed.data })
    .eq("id", store.id);
  if (error) return { ok: false as const, message: "Não foi possível salvar." };
  return { ok: true as const, minutes: parsed.data };
}
