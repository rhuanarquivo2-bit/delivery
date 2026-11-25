import { PAYMENT_LABELS, changeDue } from "@/lib/pricing";
import type { Order } from "@/lib/types";
import { formatBRL } from "@/lib/utils";

/** Itens + totais + pagamento. Usado no painel e no comprovante. */
export function OrderItemsList({ order, compact = false }: { order: Order; compact?: boolean }) {
  return (
    <ul className={compact ? "grid gap-1.5" : "grid gap-3"}>
      {(order.order_items ?? []).map((item, i) => (
        <li key={item.id ?? i} className="flex justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold">
              {item.quantity}x {item.product_name}
              {item.size_name ? ` (${item.size_name})` : ""}
            </p>
            {item.flavors?.length ? <p className="text-[0.92em]">Sabores: {item.flavors.join(" + ")}</p> : null}
            {item.options.map((o, j) => (
              <p key={j} className="text-[0.92em]">
                + {o.name}
                {o.price_cents ? ` (${formatBRL(o.price_cents)})` : ""}
              </p>
            ))}
            {item.notes ? <p className="text-[0.92em] font-semibold">Obs.: {item.notes}</p> : null}
            {item.promotion_name ? <p className="text-[0.92em]">Promoção: {item.promotion_name}</p> : null}
          </div>
          <span className="shrink-0">{formatBRL(item.total_cents)}</span>
        </li>
      ))}
    </ul>
  );
}

export function OrderTotals({ order }: { order: Order }) {
  const change = changeDue(order.total_cents, order.change_for_cents);
  return (
    <dl className="grid gap-1">
      <div className="flex justify-between">
        <dt>Subtotal</dt>
        <dd>{formatBRL(order.subtotal_cents)}</dd>
      </div>
      {order.fulfillment === "delivery" ? (
        <div className="flex justify-between">
          <dt>Taxa de entrega</dt>
          <dd>{formatBRL(order.delivery_fee_cents)}</dd>
        </div>
      ) : null}
      {order.discount_cents ? (
        <div className="flex justify-between">
          <dt>{order.coupon_code ? `Cupom ${order.coupon_code}` : "Desconto"}</dt>
          <dd>- {formatBRL(order.discount_cents)}</dd>
        </div>
      ) : null}
      <div className="flex justify-between text-[1.15em] font-bold">
        <dt>Total</dt>
        <dd>{formatBRL(order.total_cents)}</dd>
      </div>
      <div className="flex justify-between">
        <dt>Pagamento</dt>
        <dd className="font-semibold">{PAYMENT_LABELS[order.payment_method]}</dd>
      </div>
      {order.payment_status === "paid" ? (
        <div className="flex justify-between font-bold">
          <dt>{order.payment_method === "pix_whatsapp" ? "Pix confirmado" : "Pago online"}</dt>
          <dd>Não cobrar na entrega</dd>
        </div>
      ) : order.payment_method === "pix_whatsapp" ? (
        <div className="flex justify-between font-bold">
          <dt>Pix a confirmar</dt>
          <dd>Conferir comprovante no WhatsApp</dd>
        </div>
      ) : null}
      {order.payment_method === "cash" ? (
        change !== null ? (
          <>
            <div className="flex justify-between">
              <dt>Troco para</dt>
              <dd>{formatBRL(order.change_for_cents!)}</dd>
            </div>
            <div className="flex justify-between font-bold">
              <dt>Levar de troco</dt>
              <dd>{formatBRL(change)}</dd>
            </div>
          </>
        ) : (
          <div className="flex justify-between">
            <dt>Troco</dt>
            <dd>Não precisa</dd>
          </div>
        )
      ) : null}
    </dl>
  );
}

export function formatPhoneBR(digits: string) {
  const d = digits.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}

export function orderAddress(order: Order) {
  if (order.fulfillment !== "delivery") return "Retirada na loja";
  return [
    [order.address_street, order.address_number].filter(Boolean).join(", "),
    order.address_complement,
    order.address_district,
    order.address_zip ? `CEP ${order.address_zip.slice(0, 5)}-${order.address_zip.slice(5)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
