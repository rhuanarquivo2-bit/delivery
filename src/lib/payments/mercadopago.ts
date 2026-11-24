import "server-only";
import { PaymentError, toCents, toReais, type PixGateway } from "./types";

/**
 * Mercado Pago, API de pagamentos (Checkout Transparente, Pix).
 * Cada loja usa o Access Token de produção da própria conta: o dinheiro cai direto nela.
 */
const BASE = process.env.MERCADOPAGO_API_URL ?? "https://api.mercadopago.com";

async function call<T>(token: string, path: string, init: RequestInit & { idempotencyKey?: string } = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.idempotencyKey ? { "X-Idempotency-Key": init.idempotencyKey } : {}),
    },
    cache: "no-store",
  });
  if (res.status === 401 || res.status === 403) {
    throw new PaymentError("O Mercado Pago recusou o Access Token. Confira se copiou a credencial de produção inteira.");
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("Mercado Pago", res.status, path, body.slice(0, 500));
    throw new PaymentError("O Mercado Pago não respondeu como esperado. Tente de novo em instantes.");
  }
  return (await res.json()) as T;
}

/** "2026-11-24T19:30:00.000-03:00" (formato que o Mercado Pago aceita) */
function brTimestamp(date: Date) {
  const local = new Date(date.getTime() - 3 * 60 * 60 * 1000).toISOString().replace("Z", "");
  return `${local}-03:00`;
}

type MPPayment = {
  id: number;
  status: string;
  transaction_amount: number;
  external_reference: string | null;
  point_of_interaction?: { transaction_data?: { qr_code?: string; qr_code_base64?: string } };
};

export const mercadoPago: PixGateway = {
  async verifyAccount(token) {
    const me = await call<{ nickname?: string; email?: string; first_name?: string }>(token, "/users/me");
    return {
      label: me.email ?? me.nickname ?? me.first_name ?? "Conta Mercado Pago",
      liveMode: !token.startsWith("TEST-"),
    };
  },

  async createPix(token, input) {
    // O Mercado Pago exige pelo menos 30 minutos de validade.
    const mpExpiry = new Date(Math.max(input.expiresAt.getTime(), Date.now() + 31 * 60 * 1000));
    const payment = await call<MPPayment>(token, "/v1/payments", {
      method: "POST",
      idempotencyKey: input.orderId,
      body: JSON.stringify({
        transaction_amount: toReais(input.amountCents),
        description: `Pedido #${input.orderNumber} - ${input.storeName}`.slice(0, 240),
        payment_method_id: "pix",
        external_reference: input.orderId,
        date_of_expiration: brTimestamp(mpExpiry),
        ...(input.notificationUrl ? { notification_url: input.notificationUrl } : {}),
        payer: {
          // o cliente não informa e-mail no checkout; o Mercado Pago só exige um formato válido
          email: `pedido-${input.orderId.slice(0, 8)}@pedidos.app.br`,
          first_name: input.customer.name.split(" ")[0],
          ...(input.customer.document
            ? {
                identification: {
                  type: input.customer.document.length === 14 ? "CNPJ" : "CPF",
                  number: input.customer.document,
                },
              }
            : {}),
        },
      }),
    });
    const data = payment.point_of_interaction?.transaction_data;
    if (!data?.qr_code) throw new PaymentError("O Mercado Pago não gerou o QR Code. Tente de novo.");
    return { externalId: String(payment.id), qrCode: data.qr_code, qrBase64: data.qr_code_base64 ?? null };
  },

  async getPayment(token, externalId) {
    const p = await call<MPPayment>(token, `/v1/payments/${encodeURIComponent(externalId)}`);
    return {
      status: p.status === "approved" ? "paid" : ["cancelled", "rejected", "refunded", "charged_back"].includes(p.status) ? "cancelled" : "pending",
      amountCents: toCents(p.transaction_amount),
      orderId: p.external_reference,
    };
  },

  async cancel(token, externalId) {
    await call(token, `/v1/payments/${encodeURIComponent(externalId)}`, {
      method: "PUT",
      body: JSON.stringify({ status: "cancelled" }),
    }).catch(() => undefined);
  },
};
