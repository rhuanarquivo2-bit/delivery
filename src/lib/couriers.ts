import type { CourierDay, CourierFeeMode, CourierOrder } from "./types";
import { formatBRL } from "./utils";

/** O que o motoboy precisa cobrar do cliente na entrega. */
export function collectInstruction(o: Pick<CourierOrder, "payment_method" | "payment_status" | "total_cents" | "change_for_cents">) {
  if (o.payment_status === "paid" || o.payment_method === "pix_online") {
    return { title: "Já pago", detail: "Não cobrar nada do cliente.", tone: "paid" as const };
  }
  const total = formatBRL(o.total_cents);
  switch (o.payment_method) {
    case "cash": {
      if (o.change_for_cents && o.change_for_cents > o.total_cents) {
        return {
          title: `Cobrar ${total} em dinheiro`,
          detail: `Levar ${formatBRL(o.change_for_cents - o.total_cents)} de troco (cliente paga com ${formatBRL(o.change_for_cents)}).`,
          tone: "cash" as const,
        };
      }
      return { title: `Cobrar ${total} em dinheiro`, detail: "Sem troco.", tone: "cash" as const };
    }
    case "card_delivery":
      return { title: `Cobrar ${total} no cartão`, detail: "Levar a maquininha.", tone: "card" as const };
    default:
      return { title: `Cobrar ${total} no Pix`, detail: "O cliente paga pelo Pix da loja na hora da entrega.", tone: "pix" as const };
  }
}

/**
 * Acerto do dia entre motoboy e loja: ele entrega o dinheiro que recebeu dos clientes e
 * a loja paga as taxas + diária. Positivo: o motoboy devolve a diferença; negativo: a loja paga.
 */
export function settlement(day: Pick<CourierDay, "cash_cents" | "earned_cents">) {
  const net = day.cash_cents - day.earned_cents;
  return {
    net,
    text:
      net > 0
        ? `Motoboy devolve ${formatBRL(net)} para a loja`
        : net < 0
          ? `Loja paga ${formatBRL(-net)} ao motoboy`
          : "Nada a acertar",
  };
}

export function describeFee(mode: CourierFeeMode, feeCents: number, dailyCents: number) {
  const fee = mode === "fixed" ? `${formatBRL(feeCents)} por entrega` : "taxa do bairro por entrega";
  return dailyCents ? `${fee} + diária de ${formatBRL(dailyCents)}` : fee;
}

/** Link do Google Maps para o endereço da entrega. */
export function mapsUrl(o: Pick<CourierOrder, "address_street" | "address_number" | "address_district">, city?: string | null) {
  const q = [`${o.address_street ?? ""}, ${o.address_number ?? ""}`, o.address_district, city].filter(Boolean).join(" - ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

export function whatsappUrl(phone: string, text?: string) {
  const digits = phone.replace(/\D/g, "").replace(/^55/, "");
  return `https://wa.me/55${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
