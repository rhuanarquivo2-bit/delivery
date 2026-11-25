import "server-only";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Fulfillment, OrderStatus, PaymentMethod, PaymentStatus } from "@/lib/types";
import { storeIconUrl } from "./app-icon";
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
  address_reference: string | null;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  change_for_cents: number | null;
  cancel_reason: string | null;
  courier_id: string | null;
  store_id: string;
  stores: { name: string; slug: string; logo_url: string | null; address_city: string | null };
  order_items: { product_name: string; size_name: string | null; quantity: number }[];
};

async function load(orderId: string) {
  const { data } = await createAdminClient()
    .from("orders")
    .select(
      "id, number, status, fulfillment, customer_name, total_cents, scheduled_for, public_token, address_street, address_number, address_district, address_reference, payment_method, payment_status, change_for_cents, cancel_reason, courier_id, store_id, stores(name, slug, logo_url, address_city), order_items(product_name, size_name, quantity)",
    )
    .eq("id", orderId)
    .maybeSingle();
  return data as unknown as Row | null;
}

/** Ícone da notificação: o mesmo do app da loja (logo ou inicial). */
const storeIcon = (o: Row) => storeIconUrl(o.stores.slug, 192, o.stores.logo_url);

/** Painel da loja: chegou pedido (ou o Pix foi pago). */
export async function notifyNewOrder(orderId: string, opts: { pixPaid?: boolean } = {}) {
  if (!isPushConfigured) return;
  const o = await load(orderId);
  if (!o) return;
  await sendPush(
    { audience: "store", storeId: o.store_id },
    { ...newOrderMessage({ ...o, items: o.order_items ?? [], pixPaid: opts.pixPaid }), icon: storeIcon(o) },
  );
}

/** Pontos que o pedido rendeu (compra + boas-vindas), para contar no aviso de entregue. */
async function pointsEarned(orderId: string) {
  const { data } = await createAdminClient()
    .from("loyalty_ledger")
    .select("points, kind")
    .eq("order_id", orderId)
    .in("kind", ["earn", "welcome"]);
  return (data ?? []).reduce((n, r) => n + Number(r.points), 0);
}

/** Cliente: o pedido mudou de status. */
export async function notifyOrderStatus(orderId: string) {
  if (!isPushConfigured) return;
  const o = await load(orderId);
  if (!o) return;
  const points = o.status === "delivered" ? await pointsEarned(o.id).catch(() => 0) : 0;
  const msg = statusMessage({
    ...o,
    storeName: o.stores.name,
    slug: o.stores.slug,
    token: o.public_token,
    pointsEarned: points,
  });
  if (msg) await sendPush({ audience: "customer", orderId: o.id }, { ...msg, icon: storeIcon(o) });
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
        ...o,
        storeName: o.stores.name,
        customerName: o.customer_name,
        street: o.address_street,
        streetNumber: o.address_number,
        district: o.address_district,
        reference: o.address_reference,
        city: o.stores.address_city,
        token: courier.access_token as string,
      }),
      icon: storeIcon(o),
    },
  );
}

/** Pedido pelo link público (para quem só tem o token). */
export async function orderIdByToken(token: string) {
  const { data } = await createAdminClient().from("orders").select("id").eq("public_token", token).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}
