import "server-only";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Fulfillment, OrderStatus } from "@/lib/types";
import { courierMessage, newOrderMessage, statusMessage } from "./messages";
import { isPushConfigured, sendPush } from "./server";

/**
 * Envia depois de responder (o painel/cliente não espera o envio).
 * Fora de uma requisição (sem `after`), envia na hora sem travar quem chamou.
 */
export function later(job: () => Promise<unknown>) {
  if (!isPushConfigured) return;
  const run = () => job().catch((err) => console.error("push", err));
  try {
    after(run);
  } catch {
    void run();
  }
}

type Row = {
  id: string;
  number: number;
  status: OrderStatus;
  fulfillment: Fulfillment;
  customer_name: string;
  total_cents: number;
  scheduled_for: string | null;
  public_token: string;
  address_street: string | null;
  address_number: string | null;
  address_district: string | null;
  courier_id: string | null;
  store_id: string;
  stores: { name: string; slug: string; logo_url: string | null };
};

async function load(orderId: string) {
  const { data } = await createAdminClient()
    .from("orders")
    .select(
      "id, number, status, fulfillment, customer_name, total_cents, scheduled_for, public_token, address_street, address_number, address_district, courier_id, store_id, stores(name, slug, logo_url)",
    )
    .eq("id", orderId)
    .maybeSingle();
  return data as unknown as Row | null;
}

/** Painel da loja: chegou pedido (ou o Pix foi pago). */
export async function notifyNewOrder(orderId: string, opts: { pixPaid?: boolean } = {}) {
  if (!isPushConfigured) return;
  const o = await load(orderId);
  if (!o) return;
  await sendPush(
    { audience: "store", storeId: o.store_id },
    { ...newOrderMessage({ ...o, scheduled: Boolean(o.scheduled_for), pixPaid: opts.pixPaid }), icon: o.stores.logo_url },
  );
}

/** Cliente: o pedido mudou de status. */
export async function notifyOrderStatus(orderId: string) {
  if (!isPushConfigured) return;
  const o = await load(orderId);
  if (!o) return;
  const msg = statusMessage({ ...o, storeName: o.stores.name, slug: o.stores.slug, token: o.public_token });
  if (msg) await sendPush({ audience: "customer", orderId: o.id }, { ...msg, icon: o.stores.logo_url });
}

/** Motoboy: entrega atribuída a ele. */
export async function notifyCourier(orderId: string) {
  if (!isPushConfigured) return;
  const o = await load(orderId);
  if (!o?.courier_id) return;
  const { data: courier } = await createAdminClient()
    .from("couriers")
    .select("access_token")
    .eq("id", o.courier_id)
    .maybeSingle();
  if (!courier?.access_token) return;
  await sendPush(
    { audience: "courier", courierId: o.courier_id },
    {
      ...courierMessage({
        number: o.number,
        storeName: o.stores.name,
        street: o.address_street,
        streetNumber: o.address_number,
        district: o.address_district,
        token: courier.access_token as string,
      }),
      icon: o.stores.logo_url,
    },
  );
}

/** Pedido pelo link público (para quem só tem o token). */
export async function orderIdByToken(token: string) {
  const { data } = await createAdminClient().from("orders").select("id").eq("public_token", token).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}
