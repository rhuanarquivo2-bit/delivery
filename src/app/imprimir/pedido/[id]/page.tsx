/* eslint-disable @next/next/no-img-element -- impressão: <img> simples sai mais confiável que next/image */
import { notFound } from "next/navigation";
import { formatPhoneBR, OrderItemsList, OrderTotals } from "@/components/painel/pedidos/order-details";
import { formatCep } from "@/lib/cep";
import { getOrder } from "@/lib/orders";
import { formatScheduled } from "@/lib/schedule";
import { requireMyStore } from "@/lib/stores";
import type { Order, Store } from "@/lib/types";
import { PrintToolbar, type Via } from "./print-toolbar";

export const metadata = { title: "Comprovante" };

const dateTime = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(
    new Date(iso),
  );

function Rule() {
  return <div className="my-2 border-t border-dashed border-black" />;
}

function Scheduled({ order }: { order: Order }) {
  if (!order.scheduled_for) return null;
  return (
    <p className="my-1 border-2 border-black py-1 text-center text-[13px] font-bold uppercase">
      Agendado: {formatScheduled(order.scheduled_for)}
    </p>
  );
}

export default async function ComprovantePage({ params, searchParams }: PageProps<"/imprimir/pedido/[id]">) {
  const { id } = await params;
  const { auto, via: viaParam } = await searchParams;
  const { store } = await requireMyStore();
  const order = await getOrder(store.id, id);
  if (!order) notFound();

  const via: Via =
    viaParam === "caixa" || viaParam === "cozinha" || viaParam === "ambas"
      ? viaParam
      : store.print_kitchen_copy
        ? "ambas"
        : "caixa";

  return (
    <div className="flex-1 bg-white py-6 text-black print:py-0">
      <PrintToolbar auto={auto === "1"} via={via} />
      {via !== "cozinha" ? <CustomerCopy store={store} order={order} /> : null}
      {via === "ambas" ? <div className="my-6 break-after-page border-t border-dashed border-muted-foreground print:my-0 print:border-0" /> : null}
      {via !== "caixa" ? <KitchenCopy order={order} /> : null}
    </div>
  );
}

/** Via do caixa / do cliente: com preços, endereço e pagamento. */
function CustomerCopy({ store, order }: { store: Store; order: Order }) {
  const storeAddress = [
    [store.address_street, store.address_number].filter(Boolean).join(", "),
    store.address_district,
    [store.address_city, store.address_state].filter(Boolean).join("/"),
  ]
    .filter(Boolean)
    .join(" - ");

  return (
    <article className="mx-auto w-[72mm] font-mono text-[11.5px] leading-snug">
      <header className="text-center">
        {store.logo_url ? (
          <img src={store.logo_url} alt="" className="mx-auto mb-1 size-16 object-contain grayscale" />
        ) : null}
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
      <Scheduled order={order} />
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
            {order.address_zip ? <p>CEP: {formatCep(order.address_zip)}</p> : null}
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
  );
}

/** Via da cozinha: só o que precisa para preparar, sem preços e com letra maior. */
function KitchenCopy({ order }: { order: Order }) {
  return (
    <article className="mx-auto w-[72mm] font-mono text-[14px] leading-snug">
      <p className="text-center text-[12px] font-bold uppercase">Via da cozinha</p>
      <p className="text-center text-[24px] font-bold">#{order.number}</p>
      <p className="text-center font-bold uppercase">
        {order.fulfillment === "delivery" ? `Entrega · ${order.address_district ?? ""}` : "Retirada no balcão"}
      </p>
      <p className="text-center text-[12px]">
        {order.customer_name} · {dateTime(order.created_at)}
      </p>
      <Scheduled order={order} />
      {order.status === "cancelled" ? <p className="text-center font-bold">*** CANCELADO ***</p> : null}
      <Rule />
      <ul className="grid gap-2">
        {(order.order_items ?? []).map((item, i) => (
          <li key={item.id ?? i}>
            <p className="text-[16px] font-bold">
              {item.quantity}x {item.product_name}
              {item.size_name ? ` (${item.size_name})` : ""}
            </p>
            {item.flavors?.length && item.flavors.length > 1 ? <p>Sabores: {item.flavors.join(" + ")}</p> : null}
            {item.options.map((o, j) =>
              o.choice ? (
                <p key={j} className="font-bold">
                  {o.group}: {o.name}
                </p>
              ) : (
                <p key={j}>+ {o.name}</p>
              ),
            )}
            {item.notes ? <p className="font-bold">» {item.notes}</p> : null}
          </li>
        ))}
      </ul>
      {order.notes ? (
        <>
          <Rule />
          <p className="font-bold">OBS. DO PEDIDO</p>
          <p>{order.notes}</p>
        </>
      ) : null}
      <Rule />
    </article>
  );
}
