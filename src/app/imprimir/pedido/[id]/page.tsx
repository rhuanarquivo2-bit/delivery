import { notFound } from "next/navigation";
import { formatPhoneBR, OrderItemsList, OrderTotals } from "@/components/painel/pedidos/order-details";
import { getOrder } from "@/lib/orders";
import { requireMyStore } from "@/lib/stores";
import { PrintToolbar } from "./print-toolbar";

export const metadata = { title: "Comprovante" };

const dateTime = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(
    new Date(iso),
  );

function Rule() {
  return <div className="my-2 border-t border-dashed border-black" />;
}

export default async function ComprovantePage({ params, searchParams }: PageProps<"/imprimir/pedido/[id]">) {
  const { id } = await params;
  const { auto } = await searchParams;
  const { store } = await requireMyStore();
  const order = await getOrder(store.id, id);
  if (!order) notFound();

  const storeAddress = [
    [store.address_street, store.address_number].filter(Boolean).join(", "),
    store.address_district,
    [store.address_city, store.address_state].filter(Boolean).join("/"),
  ]
    .filter(Boolean)
    .join(" - ");

  return (
    <div className="flex-1 bg-white py-6 text-black print:py-0">
      <PrintToolbar auto={auto === "1"} />
      <article className="mx-auto w-[72mm] font-mono text-[11.5px] leading-snug">
        <header className="text-center">
          <p className="text-[14px] font-bold uppercase">{store.name}</p>
          {storeAddress ? <p>{storeAddress}</p> : null}
          {store.phone ? <p>Tel: {formatPhoneBR(store.phone)}</p> : null}
        </header>
        <Rule />
        <p className="text-center text-[18px] font-bold">PEDIDO #{order.number}</p>
        <p className="text-center">{dateTime(order.created_at)}</p>
        <p className="text-center font-bold uppercase">
          {order.fulfillment === "delivery" ? "Entrega" : "Retirada no balcão"}
        </p>
        {order.status === "cancelled" ? <p className="text-center font-bold">*** CANCELADO ***</p> : null}
        <Rule />
        <section>
          <p className="font-bold">CLIENTE</p>
          <p>{order.customer_name}</p>
          <p>{formatPhoneBR(order.customer_phone)}</p>
          {order.fulfillment === "delivery" ? (
            <>
              <p>
                {order.address_street}, {order.address_number}
                {order.address_complement ? ` - ${order.address_complement}` : ""}
              </p>
              <p>Bairro: {order.address_district}</p>
              {order.address_reference ? <p>Ref.: {order.address_reference}</p> : null}
            </>
          ) : null}
        </section>
        <Rule />
        <p className="font-bold">ITENS</p>
        <OrderItemsList order={order} compact />
        {order.notes ? (
          <>
            <Rule />
            <p className="font-bold">OBSERVAÇÕES</p>
            <p>{order.notes}</p>
          </>
        ) : null}
        <Rule />
        <OrderTotals order={order} />
        <Rule />
        <p className="text-center">Documento sem valor fiscal</p>
        <p className="text-center">Obrigado pela preferência!</p>
      </article>
    </div>
  );
}
