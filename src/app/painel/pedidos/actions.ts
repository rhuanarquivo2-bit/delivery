"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMyStore } from "@/lib/stores";
import { createClient } from "@/lib/supabase/server";
import { later, notifyOrderStatus } from "@/lib/push/notify";

const schema = z.object({
  orderId: z.string().uuid(),
  status: z.enum(["pending", "preparing", "ready", "out_for_delivery", "delivered", "cancelled"]),
  reason: z.string().trim().max(200).optional(),
});

export async function updateOrderStatus(input: z.input<typeof schema>) {
  const { store } = await requireMyStore();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false as const, message: "Dados inválidos." };
  const { orderId, status, reason } = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .update(status === "cancelled" ? { status, cancel_reason: reason || null } : { status })
    .eq("id", orderId)
    .eq("store_id", store.id)
    .in("payment_status", ["on_delivery", "paid"])
    .select("*")
    .maybeSingle();
  if (error || !data) return { ok: false as const, message: "Não foi possível atualizar o pedido." };
  revalidatePath("/painel/pedidos");
  later(() => notifyOrderStatus(orderId));
  return { ok: true as const, order: data };
}

/** Pix pelo WhatsApp: o lojista confere o comprovante e marca (ou desmarca) como pago. */
export async function setWhatsappPixPaid(input: { orderId: string; paid: boolean }) {
  await requireMyStore();
  const parsed = z.object({ orderId: z.string().uuid(), paid: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false as const, message: "Dados inválidos." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_whatsapp_pix_paid", {
    p_order_id: parsed.data.orderId,
    p_paid: parsed.data.paid,
  });
  if (error || !data) return { ok: false as const, message: "Não foi possível atualizar o pagamento." };
  revalidatePath("/painel/pedidos");
  return { ok: true as const, order: data };
}
