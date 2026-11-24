import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PaymentStatus } from "@/lib/types";
import { asaas } from "./asaas";
import { mercadoPago } from "./mercadopago";
import { PaymentError, type PixCustomer, type PixGateway, type PixProvider } from "./types";

/** Tempo que o cliente tem para pagar o Pix antes de o pedido ser cancelado. */
export const PIX_MINUTES = 30;

export const gateways: Record<PixProvider, PixGateway> = { mercadopago: mercadoPago, asaas };

type Admin = ReturnType<typeof createAdminClient>;
type Account = { provider: PixProvider; access_token: string; webhook_token: string | null };

async function getAccount(admin: Admin, storeId: string): Promise<Account | null> {
  const { data } = await admin
    .from("store_payment_accounts")
    .select("provider, access_token, webhook_token")
    .eq("store_id", storeId)
    .maybeSingle();
  return (data as Account | null) ?? null;
}

/**
 * Endereço público do site para os avisos de pagamento. Só https: em desenvolvimento
 * (http://localhost) fica sem aviso e a página do pedido confere o pagamento sozinha.
 */
export async function publicOrigin(): Promise<string | null> {
  const fixed = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (fixed) return fixed.startsWith("https://") ? fixed : null;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  if (!host || proto !== "https" || host.startsWith("localhost")) return null;
  return `https://${host}`;
}

export function webhookUrl(origin: string, provider: PixProvider, storeId: string) {
  return `${origin}/api/pagamentos/${provider}?loja=${storeId}`;
}

/**
 * Gera a cobrança Pix de um pedido recém-criado. Se não der certo, o pedido é cancelado
 * (assim ele não fica perdido, e o cupom volta a valer) e o erro sobe para o checkout.
 */
export async function createPixForOrder(input: {
  orderId: string;
  storeId: string;
  storeName: string;
  orderNumber: number;
  amountCents: number;
  customer: PixCustomer;
}) {
  const admin = createAdminClient();
  let externalId: string | null = null;
  let provider: PixProvider | null = null;
  try {
    const account = await getAccount(admin, input.storeId);
    if (!account) throw new PaymentError("A loja não está recebendo Pix online agora. Escolha outra forma de pagamento.");
    provider = account.provider;
    const origin = await publicOrigin();
    const expiresAt = new Date(Date.now() + PIX_MINUTES * 60 * 1000);
    const charge = await gateways[account.provider].createPix(account.access_token, {
      orderId: input.orderId,
      orderNumber: input.orderNumber,
      storeName: input.storeName,
      amountCents: input.amountCents,
      customer: input.customer,
      expiresAt,
      notificationUrl: origin && account.provider === "mercadopago" ? webhookUrl(origin, "mercadopago", input.storeId) : null,
    });
    externalId = charge.externalId;
    const { error } = await admin.from("order_payments").insert({
      order_id: input.orderId,
      store_id: input.storeId,
      provider: account.provider,
      external_id: charge.externalId,
      amount_cents: input.amountCents,
      qr_code: charge.qrCode,
      qr_base64: charge.qrBase64,
      expires_at: expiresAt.toISOString(),
    });
    if (error) throw new Error(`order_payments: ${error.message}`);
  } catch (err) {
    if (externalId && provider) {
      const account = await getAccount(admin, input.storeId);
      if (account) await gateways[provider].cancel(account.access_token, externalId);
    }
    await admin
      .from("orders")
      .update({
        status: "cancelled",
        payment_status: "expired",
        cancel_reason: "Não foi possível gerar o Pix",
        cancelled_at: new Date().toISOString(),
      })
      .eq("id", input.orderId);
    if (err instanceof PaymentError) throw err;
    console.error("Pix", err);
    throw new PaymentError("Não conseguimos gerar o Pix agora. Tente de novo ou escolha outra forma de pagamento.");
  }
}

/**
 * Confere o Pix de um pedido direto no Mercado Pago/Asaas (nunca confiamos só no aviso).
 * Pago: libera o pedido para a loja. Passou do prazo: cancela a cobrança e o pedido.
 */
export async function syncOrderPayment(orderId: string): Promise<PaymentStatus | null> {
  const admin = createAdminClient();
  const [{ data: order }, { data: payment }] = await Promise.all([
    admin.from("orders").select("store_id, payment_status").eq("id", orderId).maybeSingle(),
    admin.from("order_payments").select("provider, external_id, expires_at").eq("order_id", orderId).maybeSingle(),
  ]);
  if (!order) return null;
  const status = order.payment_status as PaymentStatus;
  if (!payment || (status !== "awaiting" && status !== "expired")) return status;

  const account = await getAccount(admin, order.store_id);
  if (account && account.provider === payment.provider) {
    const gateway = gateways[account.provider];
    try {
      const remote = await gateway.getPayment(account.access_token, payment.external_id);
      if (remote.status === "paid") {
        await admin.rpc("mark_order_paid", {
          p_order_id: orderId,
          p_external_id: payment.external_id,
          p_amount_cents: remote.amountCents,
        });
        return "paid";
      }
      if (status === "awaiting" && new Date(payment.expires_at).getTime() <= Date.now()) {
        await gateway.cancel(account.access_token, payment.external_id);
      }
    } catch (err) {
      console.error("Pix sync", orderId, err);
      return status;
    }
  }
  if (status === "awaiting" && new Date(payment.expires_at).getTime() <= Date.now()) {
    const { data } = await admin.rpc("expire_order_payment", { p_order_id: orderId });
    return data ? "expired" : status;
  }
  return status;
}

/** Aviso do Mercado Pago/Asaas: acha o pedido pela cobrança e confere. */
export async function syncByExternalId(provider: PixProvider, storeId: string, externalId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("order_payments")
    .select("order_id")
    .eq("provider", provider)
    .eq("store_id", storeId)
    .eq("external_id", externalId)
    .maybeSingle();
  if (data) await syncOrderPayment(data.order_id);
}

export async function getWebhookToken(storeId: string) {
  const account = await getAccount(createAdminClient(), storeId);
  return account?.webhook_token ?? null;
}

/**
 * Pedidos com Pix pendente que já passaram do prazo (o cliente fechou a página, ou o aviso
 * se perdeu). Roda quando a loja abre o painel: confere cada um e libera ou cancela.
 */
export async function sweepStorePayments(storeId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("orders")
    .select("id")
    .eq("store_id", storeId)
    .eq("payment_status", "awaiting")
    .lte("created_at", new Date(Date.now() - PIX_MINUTES * 60 * 1000).toISOString())
    .limit(20);
  await Promise.all((data ?? []).map((row) => syncOrderPayment(row.id)));
}

export { PaymentError, PROVIDER_LABELS } from "./types";
export type { PixProvider } from "./types";
