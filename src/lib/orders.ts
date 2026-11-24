import "server-only";
import { createClient } from "./supabase/server";
import type { Order } from "./types";

export const ORDER_SELECT = "*, order_items(*)";

/** Pix online ainda não pago (ou vencido) não é pedido para a loja: fica fora do painel. */
const VISIBLE_PAYMENT = ["on_delivery", "paid"];

/** Pedidos em andamento + os concluídos/cancelados das últimas 18 horas. */
export async function getBoardOrders(storeId: string): Promise<Order[]> {
  const supabase = await createClient();
  const since = new Date(Date.now() - 18 * 60 * 60 * 1000).toISOString();
  const [open, recent] = await Promise.all([
    supabase
      .from("orders")
      .select(ORDER_SELECT)
      .eq("store_id", storeId)
      .in("payment_status", VISIBLE_PAYMENT)
      .in("status", ["pending", "preparing", "ready", "out_for_delivery"])
      .order("created_at", { ascending: true })
      .limit(200),
    supabase
      .from("orders")
      .select(ORDER_SELECT)
      .eq("store_id", storeId)
      .in("payment_status", VISIBLE_PAYMENT)
      .in("status", ["delivered", "cancelled"])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  return [...((open.data ?? []) as Order[]), ...((recent.data ?? []) as Order[])].map(sortItems);
}

export async function getOrder(storeId: string, orderId: string): Promise<Order | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select(ORDER_SELECT)
    .eq("store_id", storeId)
    .eq("id", orderId)
    .maybeSingle();
  return data ? sortItems(data as Order) : null;
}

function sortItems(order: Order): Order {
  const items = [...(order.order_items ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  return { ...order, order_items: items };
}
