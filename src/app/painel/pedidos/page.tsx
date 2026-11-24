import { OrdersBoard } from "@/components/painel/pedidos/orders-board";
import { getBoardOrders } from "@/lib/orders";
import { sweepStorePayments } from "@/lib/payments";
import { isAdminConfigured } from "@/lib/supabase/admin";
import { requireMyStore } from "@/lib/stores";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Pedidos" };

export default async function PedidosPage() {
  const { store } = await requireMyStore();
  // Pix que venceu sem ninguém olhar (ou cujo aviso se perdeu): confere antes de mostrar.
  if (isAdminConfigured && store.pix_provider) await sweepStorePayments(store.id).catch(() => undefined);
  const supabase = await createClient();
  const [orders, { data: couriers }] = await Promise.all([
    getBoardOrders(store.id),
    supabase.from("couriers").select("id, name, active").eq("store_id", store.id).order("name"),
  ]);
  return <OrdersBoard storeId={store.id} initialOrders={orders} couriers={couriers ?? []} />;
}
