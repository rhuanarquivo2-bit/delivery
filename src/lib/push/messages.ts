import { collectInstruction, mapsUrl } from "../couriers";
import { formatScheduled } from "../schedule";
import type { Fulfillment, OrderStatus, PaymentMethod, PaymentStatus } from "../types";
import { formatBRL } from "../utils";

/** Botão na notificação (Android e computador; o iPhone mostra só o texto). */
export type PushAction = { action: string; title: string; url: string };

export type PushMessage = {
  title: string;
  body: string;
  url: string;
  tag: string;
  actions?: PushAction[];
  /** Fica na tela até alguém tocar (pedido novo no painel). */
  requireInteraction?: boolean;
};

type Item = { product_name: string; size_name?: string | null; quantity: number };

/** "2x X-Burger, 1x Pizza (Grande) +2 itens" */
export function itemsLine(items: Item[], max = 3) {
  if (!items.length) return "";
  const shown = items
    .slice(0, max)
    .map((i) => `${i.quantity}x ${i.product_name}${i.size_name ? ` (${i.size_name})` : ""}`)
    .join(", ");
  const rest = items.length - max;
  return rest > 0 ? `${shown} +${rest} ${rest === 1 ? "item" : "itens"}` : shown;
}

function paymentLine(o: { payment_method: PaymentMethod; payment_status: PaymentStatus; total_cents: number; change_for_cents: number | null }) {
  if (o.payment_status === "paid" || o.payment_method === "pix_online") return "✅ Pago online pelo Pix";
  switch (o.payment_method) {
    case "cash":
      return o.change_for_cents && o.change_for_cents > o.total_cents
        ? `💵 Dinheiro · troco para ${formatBRL(o.change_for_cents)}`
        : "💵 Dinheiro · sem troco";
    case "pix_whatsapp":
      return "📲 Pix pelo WhatsApp · confira o comprovante";
    case "card_delivery":
      return "💳 Cartão na entrega";
    default:
      return "📱 Pix na entrega";
  }
}

const lines = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join("\n");

/** Painel: pedido novo (ou Pix confirmado). */
export function newOrderMessage(o: {
  number: number;
  customer_name: string;
  total_cents: number;
  fulfillment: Fulfillment;
  address_district?: string | null;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  change_for_cents: number | null;
  scheduled_for?: string | null;
  items?: Item[];
  pixPaid?: boolean;
}): PushMessage {
  const total = formatBRL(o.total_cents);
  const title = o.pixPaid
    ? `💰 Pix pago! Pedido #${o.number} · ${total}`
    : o.scheduled_for
      ? `📅 Pedido agendado #${o.number} · ${total}`
      : `🔔 Novo pedido #${o.number} · ${total}`;
  const where =
    o.fulfillment === "delivery" ? `🛵 Entrega${o.address_district ? ` · ${o.address_district}` : ""}` : "🛍️ Retirada no balcão";
  return {
    title,
    body: lines(
      `👤 ${o.customer_name} · ${where}`,
      o.scheduled_for && `🕒 Para ${formatScheduled(o.scheduled_for).replace(/^Hoje/, "hoje").replace(/^Amanhã/, "amanhã")}`,
      !!o.items?.length && `🧾 ${itemsLine(o.items)}`,
      paymentLine(o),
    ),
    url: "/painel/pedidos",
    tag: `pedido-${o.number}`,
    requireInteraction: true,
    actions: [{ action: "abrir", title: "Ver pedido", url: "/painel/pedidos" }],
  };
}

/** Motoboy: entrega atribuída a ele. */
export function courierMessage(o: {
  number: number;
  storeName: string;
  customerName: string;
  street: string | null;
  streetNumber: string | null;
  district: string | null;
  reference?: string | null;
  city?: string | null;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  total_cents: number;
  change_for_cents: number | null;
  token: string;
}): PushMessage {
  const where = [[o.street, o.streetNumber].filter(Boolean).join(", "), o.district].filter(Boolean).join(" · ");
  const collect = collectInstruction(o);
  const url = `/entregador/${o.token}`;
  return {
    title: `🛵 Nova entrega #${o.number} · ${o.storeName}`,
    body: lines(
      `📍 ${where || "Abra o app para ver o endereço"}`,
      o.reference && `🔎 ${o.reference}`,
      `👤 ${o.customerName}`,
      collect.tone === "paid" ? "✅ Já pago, não cobre nada" : `💰 ${collect.title}${collect.tone === "cash" && collect.detail !== "Sem troco." ? ` · ${collect.detail}` : ""}`,
    ),
    url,
    tag: `entrega-${o.number}`,
    actions: [
      { action: "abrir", title: "Ver entrega", url },
      ...(where
        ? [{ action: "mapa", title: "🗺️ Abrir mapa", url: mapsUrl({ address_street: o.street, address_number: o.streetNumber, address_district: o.district }, o.city) }]
        : []),
    ],
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
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  total_cents: number;
  change_for_cents: number | null;
  scheduled_for?: string | null;
  cancel_reason?: string | null;
  pointsEarned?: number;
}): PushMessage | null {
  const n = `#${o.number}`;
  const url = `/loja/${o.slug}/pedido/${o.token}`;
  const track: PushAction = { action: "abrir", title: "Acompanhar pedido", url };
  const base = { url, tag: `pedido-${o.token.slice(0, 8)}`, actions: [track] };
  const pickup = o.fulfillment === "pickup";

  switch (o.status) {
    case "preparing":
      return {
        ...base,
        title: o.scheduled_for ? `✅ Pedido ${n} confirmado!` : `👨‍🍳 Pedido ${n} em preparo`,
        body: o.scheduled_for
          ? `A ${o.storeName} confirmou seu pedido para ${formatScheduled(o.scheduled_for).replace(/^Hoje/, "hoje").replace(/^Amanhã/, "amanhã")}. Pode deixar com a gente!`
          : `A ${o.storeName} aceitou seu pedido e já está preparando tudo com carinho. 🔥`,
      };
    case "ready":
      if (!pickup) return null;
      return {
        ...base,
        title: `🛍️ Pedido ${n} pronto para retirar!`,
        body: lines(`Pode vir buscar na ${o.storeName}, estamos te esperando.`, payOnArrival(o)),
      };
    case "out_for_delivery":
      return {
        ...base,
        title: `🛵 Pedido ${n} saiu para entrega!`,
        body: lines("Já está a caminho, fique de olho na campainha. 🔔", payOnArrival(o)),
      };
    case "delivered":
      return {
        ...base,
        title: pickup ? `😋 Pedido ${n} retirado. Bom apetite!` : `😋 Pedido ${n} entregue. Bom apetite!`,
        body: lines(
          `Obrigado por pedir na ${o.storeName}! ❤️`,
          o.pointsEarned ? `🎁 Você ganhou ${o.pointsEarned} pontos de fidelidade.` : null,
        ),
        actions: [{ action: "pedir", title: "Pedir de novo", url: `/loja/${o.slug}` }],
      };
    case "cancelled":
      return {
        ...base,
        title: `❌ Pedido ${n} cancelado`,
        body: lines(
          `A ${o.storeName} cancelou seu pedido.`,
          o.cancel_reason ? `Motivo: ${o.cancel_reason}` : null,
          o.payment_status === "paid" ? "O valor pago será devolvido pela loja." : "Fale com a loja se tiver dúvida.",
        ),
      };
    default:
      return null;
  }
}

/** O que o cliente precisa ter em mãos quando o pedido chegar. */
function payOnArrival(o: { payment_method: PaymentMethod; payment_status: PaymentStatus; total_cents: number; change_for_cents: number | null }) {
  if (o.payment_status === "paid" || o.payment_method === "pix_online") return "✅ Já está pago, é só receber.";
  const total = formatBRL(o.total_cents);
  switch (o.payment_method) {
    case "cash":
      return o.change_for_cents && o.change_for_cents > o.total_cents
        ? `💵 Total ${total}. O troco para ${formatBRL(o.change_for_cents)} já vai junto.`
        : `💵 Tenha ${total} em dinheiro.`;
    case "pix_whatsapp":
      return `📲 Pix de ${total}: se ainda não pagou, peça a chave Pix no WhatsApp da loja.`;
    case "card_delivery":
      return `💳 Pagamento no cartão: ${total}.`;
    default:
      return `📱 Pagamento no Pix na entrega: ${total}.`;
  }
}
