import { OrdersBoard } from "@/components/painel/pedidos/orders-board";
import { getBoardOrders } from "@/lib/orders";
import { requireMyStore } from "@/lib/stores";

export const metadata = { title: "Pedidos" };

export default async function PedidosPage() {
  const { store } = await requireMyStore();
  const orders = await getBoardOrders(store.id);
  return <OrdersBoard storeId={store.id} initialOrders={orders} />;
}
