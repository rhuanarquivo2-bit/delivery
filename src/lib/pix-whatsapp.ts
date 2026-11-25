import type { Fulfillment, OrderItem } from "./types";
import { formatBRL } from "./utils";

/** Link do WhatsApp da loja (número salvo só com DDD, ou já com 55 na frente). */
export function storeWhatsappUrl(whatsapp: string, text?: string) {
  const digits = whatsapp.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  return `https://wa.me/55${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

export type PixWhatsappOrder = {
  number: number;
  storeName: string;
  customerName: string;
  fulfillment: Fulfillment;
  address: string | null;
  scheduled: string | null;
  items: Pick<OrderItem, "quantity" | "product_name" | "size_name" | "flavors" | "options" | "notes" | "total_cents">[];
  subtotalCents: number;
  deliveryFeeCents: number;
  discountCents: number;
  couponCode: string | null;
  totalCents: number;
  /** Link para acompanhar o pedido (a loja também consegue abrir). */
  link?: string | null;
};

/**
 * Mensagem pronta que o cliente manda no WhatsApp da loja pedindo a chave Pix.
 * Sem emojis: alguns celulares mostram "?" no lugar quando o texto vem pelo link.
 */
export function pixWhatsappMessage(o: PixWhatsappOrder) {
  const lines: string[] = [
    `Olá! Fiz o pedido *#${o.number}* no site da ${o.storeName} e escolhi pagar com *Pix*. Pode me enviar a chave Pix, por favor?`,
    "",
    `*Pedido #${o.number}*`,
  ];
  for (const item of o.items) {
    lines.push(`${item.quantity}x ${item.product_name}${item.size_name ? ` (${item.size_name})` : ""} - ${formatBRL(item.total_cents)}`);
    if (item.flavors?.length) lines.push(`   Sabores: ${item.flavors.join(" + ")}`);
    if (item.options.length) lines.push(`   + ${item.options.map((op) => op.name).join(", ")}`);
    if (item.notes) lines.push(`   Obs.: ${item.notes}`);
  }
  lines.push("", `Subtotal: ${formatBRL(o.subtotalCents)}`);
  if (o.fulfillment === "delivery") {
    lines.push(`Entrega: ${o.deliveryFeeCents ? formatBRL(o.deliveryFeeCents) : "grátis"}`);
  }
  if (o.discountCents) {
    lines.push(`${o.couponCode ? `Cupom ${o.couponCode}` : "Desconto"}: - ${formatBRL(o.discountCents)}`);
  }
  lines.push(`*Total: ${formatBRL(o.totalCents)}*`, "");
  lines.push(`*Nome:* ${o.customerName}`);
  lines.push(o.fulfillment === "delivery" ? `*Entrega em:* ${o.address ?? ""}` : "*Retirada na loja*");
  if (o.scheduled) lines.push(`*Agendado para:* ${o.scheduled}`);
  if (o.link) lines.push("", `Acompanhar o pedido: ${o.link}`);
  return lines.join("\n");
}
