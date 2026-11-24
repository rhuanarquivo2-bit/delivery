import type { Fulfillment, OrderStatus } from "./types";

export const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Aguardando a loja",
  preparing: "Em preparo",
  ready: "Pronto",
  out_for_delivery: "Saiu para entrega",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

/** Texto do status para o cliente, considerando entrega ou retirada. */
export function customerStatusLabel(status: OrderStatus, fulfillment: Fulfillment) {
  if (fulfillment === "pickup") {
    if (status === "ready") return "Pronto para retirada";
    if (status === "delivered") return "Retirado";
  }
  return STATUS_LABELS[status];
}

/** Etapas mostradas na linha do tempo do cliente. */
export function customerSteps(fulfillment: Fulfillment): OrderStatus[] {
  return fulfillment === "delivery"
    ? ["pending", "preparing", "out_for_delivery", "delivered"]
    : ["pending", "preparing", "ready", "delivered"];
}

/** Próximo status no painel (botão principal do cartão do pedido). */
export function nextStatus(status: OrderStatus, fulfillment: Fulfillment): OrderStatus | null {
  switch (status) {
    case "pending":
      return "preparing";
    case "preparing":
      return "ready";
    case "ready":
      return fulfillment === "delivery" ? "out_for_delivery" : "delivered";
    case "out_for_delivery":
      return "delivered";
    default:
      return null;
  }
}

export function nextStatusAction(status: OrderStatus, fulfillment: Fulfillment) {
  switch (status) {
    case "pending":
      return "Aceitar pedido";
    case "preparing":
      return "Marcar como pronto";
    case "ready":
      return fulfillment === "delivery" ? "Saiu para entrega" : "Cliente retirou";
    case "out_for_delivery":
      return "Confirmar entrega";
    default:
      return null;
  }
}
