import { OrdersBoard } from "@/components/painel/pedidos/orders-board";
import { getBoardOrders } from "@/lib/orders";
import { sweepStorePayments } from "@/lib/payments";
import { isAdminConfigured } from "@/lib/supabase/admin";
import { requireMyStore } from "@/lib/stores";

export const metadata = { title: "Pedidos" };

export default async function PedidosPage() {
  const { store } = await requireMyStore();
  // Pix que venceu sem ninguém olhar (ou cujo aviso se perdeu): confere antes de mostrar.
  if (isAdminConfigured && store.pix_provider) await sweepStorePayments(store.id).catch(() => undefined);
  const orders = await getBoardOrders(store.id);
  return <OrdersBoard storeId={store.id} initialOrders={orders} />;
}
