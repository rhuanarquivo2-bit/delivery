import "server-only";
import { PaymentError, toCents, toReais, type PixGateway } from "./types";
import { APP_NAME } from "@/lib/brand";

/**
 * Asaas (API v3). A chave de API da conta da loja vai no header `access_token`.
 * Chaves de sandbox começam com "$aact_hmlg_"; as de produção com "$aact_prod_".
 */
function baseUrl(token: string) {
  if (process.env.ASAAS_API_URL) return process.env.ASAAS_API_URL;
  return token.includes("_hmlg_") ? "https://api-sandbox.asaas.com/v3" : "https://api.asaas.com/v3";
}

async function call<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${baseUrl(token)}${path}`, {
    ...init,
    headers: {
      access_token: token,
      "Content-Type": "application/json",
      "User-Agent": "Fomely/1.0",
    },
    cache: "no-store",
  });
  if (res.status === 401 || res.status === 403) {
    throw new PaymentError("O Asaas recusou a chave de API. Confira se copiou a chave inteira, começando com $aact_.");
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("Asaas", res.status, path, body.slice(0, 500));
    let detail = "";
    try {
      detail = (JSON.parse(body) as { errors?: { description?: string }[] }).errors?.[0]?.description ?? "";
    } catch {}
    throw new PaymentError(detail ? `Asaas: ${detail}` : "O Asaas não respondeu como esperado. Tente de novo em instantes.");
  }
  return (await res.json()) as T;
}

/** Data de hoje no horário de Brasília (AAAA-MM-DD), usada como vencimento da cobrança. */
const todayBR = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

type AsaasPayment = { id: string; status: string; value: number; externalReference: string | null };

export const asaas: PixGateway & {
  createWebhook(token: string, input: { url: string; email: string; authToken: string }): Promise<void>;
} = {
  async verifyAccount(token) {
    await call(token, "/finance/balance");
    const info = await call<{ name?: string; email?: string }>(token, "/myAccount/commercialInfo").catch(() => null);
    return { label: info?.email ?? info?.name ?? "Conta Asaas", liveMode: !token.includes("_hmlg_") };
  },

  async createPix(token, input) {
    if (!input.customer.document) throw new PaymentError("Informe o CPF para pagar com Pix.");
    const found = await call<{ data: { id: string }[] }>(
      token,
      `/customers?cpfCnpj=${encodeURIComponent(input.customer.document)}&limit=1`,
    );
    const customerId =
      found.data[0]?.id ??
      (
        await call<{ id: string }>(token, "/customers", {
          method: "POST",
          body: JSON.stringify({
            name: input.customer.name,
            cpfCnpj: input.customer.document,
            mobilePhone: input.customer.phone,
            notificationDisabled: true,
          }),
        })
      ).id;

    const payment = await call<AsaasPayment>(token, "/payments", {
      method: "POST",
      body: JSON.stringify({
        customer: customerId,
        billingType: "PIX",
        value: toReais(input.amountCents),
        dueDate: todayBR(),
        description: `Pedido #${input.orderNumber} - ${input.storeName}`.slice(0, 500),
        externalReference: input.orderId,
      }),
    });
    const qr = await call<{ encodedImage?: string; payload?: string }>(token, `/payments/${payment.id}/pixQrCode`);
    if (!qr.payload) throw new PaymentError("O Asaas não gerou o QR Code. Confira se a conta tem uma chave Pix cadastrada.");
    return { externalId: payment.id, qrCode: qr.payload, qrBase64: qr.encodedImage ?? null };
  },

  async getPayment(token, externalId) {
    const p = await call<AsaasPayment>(token, `/payments/${encodeURIComponent(externalId)}`);
    return {
      status: ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(p.status)
        ? "paid"
        : ["REFUNDED", "REFUND_REQUESTED", "CHARGEBACK_REQUESTED"].includes(p.status)
          ? "cancelled"
          : "pending",
      amountCents: toCents(p.value),
      orderId: p.externalReference,
    };
  },

  async cancel(token, externalId) {
    await call(token, `/payments/${encodeURIComponent(externalId)}`, { method: "DELETE" }).catch(() => undefined);
  },

  /** Avisa nosso site quando um Pix for pago (o Asaas manda o authToken de volta no header). */
  async createWebhook(token, { url, email, authToken }) {
    await call(token, "/webhooks", {
      method: "POST",
      body: JSON.stringify({
        name: `${APP_NAME} - pagamentos`,
        url,
        email,
        enabled: true,
        interrupted: false,
        authToken,
        sendType: "SEQUENTIALLY",
        events: ["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"],
      }),
    });
  },
};
