import type { Fulfillment, OrderStatus } from "../types";
import { formatBRL } from "../utils";

/** Painel: pedido novo (ou Pix confirmado). */
export function newOrderMessage(o: {
  number: number;
  customer_name: string;
  total_cents: number;
  fulfillment: Fulfillment;
  scheduled?: boolean;
  pixPaid?: boolean;
}) {
  const kind = o.fulfillment === "delivery" ? "Entrega" : "Retirada";
  return {
    title: o.pixPaid ? `Pix pago · pedido #${o.number}` : `Novo pedido #${o.number}${o.scheduled ? " (agendado)" : ""}`,
    body: `${o.customer_name} · ${formatBRL(o.total_cents)} · ${kind}`,
    url: "/painel/pedidos",
    tag: `pedido-${o.number}`,
  };
}

/** Motoboy: entrega atribuída a ele. */
export function courierMessage(o: {
  number: number;
  storeName: string;
  street: string | null;
  streetNumber: string | null;
  district: string | null;
  token: string;
}) {
  const where = [[o.street, o.streetNumber].filter(Boolean).join(", "), o.district].filter(Boolean).join(" · ");
  return {
    title: `Nova entrega #${o.number} · ${o.storeName}`,
    body: where || "Abra o app para ver o endereço.",
    url: `/entregador/${o.token}`,
    tag: `entrega-${o.number}`,
  };
}

/** Cliente: mudança de status. Null quando a mudança não interessa ao cliente. */
export function statusMessage(o: {
  number: number;
  status: OrderStatus;
  fulfillment: Fulfillment;
  storeName: string;
  slug: string;
  token: string;
}) {
  const n = `#${o.number}`;
  const bodies: Partial<Record<OrderStatus, string>> = {
    preparing: `A loja aceitou seu pedido ${n}. Já está em preparo!`,
    ready: o.fulfillment === "pickup" ? `Seu pedido ${n} está pronto para retirada!` : undefined,
    out_for_delivery: `Seu pedido ${n} saiu para entrega!`,
    delivered: o.fulfillment === "pickup" ? `Pedido ${n} retirado. Bom apetite!` : `Pedido ${n} entregue. Bom apetite!`,
    cancelled: `Seu pedido ${n} foi cancelado. Fale com a loja se tiver dúvida.`,
  };
  const body = bodies[o.status];
  if (!body) return null;
  return { title: o.storeName, body, url: `/loja/${o.slug}/pedido/${o.token}`, tag: `pedido-${o.token.slice(0, 8)}` };
}
