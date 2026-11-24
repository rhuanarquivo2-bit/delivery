"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { asaas } from "@/lib/payments/asaas";
import { gateways, PaymentError, publicOrigin, webhookUrl } from "@/lib/payments";
import { requireMyStore, requireUser } from "@/lib/stores";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";

export type ConnectState = { ok?: boolean; message?: string; warning?: string };

const schema = z.object({
  provider: z.enum(["mercadopago", "asaas"], { message: "Escolha Mercado Pago ou Asaas." }),
  token: z.string().trim().min(20, "Cole a chave inteira.").max(400, "Chave longa demais. Confira o que foi colado."),
});

/** Conecta a conta de recebimento da loja (só o dono). O token fica guardado só no servidor. */
export async function connectPixAccount(_prev: ConnectState, formData: FormData): Promise<ConnectState> {
  const { store, role } = await requireMyStore();
  if (role !== "owner") return { message: "Só o dono da loja pode conectar a conta de recebimento." };
  if (!isAdminConfigured) {
    return { message: "Falta configurar a chave secreta do Supabase (SUPABASE_SECRET_KEY) no servidor." };
  }
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { message: parsed.error.issues[0].message };
  const { provider, token } = parsed.data;

  if (provider === "mercadopago" && !/^(APP_USR|TEST)-/.test(token)) {
    return { message: "O Access Token do Mercado Pago começa com APP_USR-. Confira se copiou o Access Token (e não a Public Key)." };
  }
  if (provider === "asaas" && !token.startsWith("$aact_")) {
    return { message: "A chave de API do Asaas começa com $aact_. Confira se copiou a chave inteira." };
  }

  let label: string;
  let liveMode: boolean;
  try {
    ({ label, liveMode } = await gateways[provider].verifyAccount(token));
  } catch (err) {
    return { message: err instanceof PaymentError ? err.message : "Não foi possível conferir a conta agora." };
  }

  let webhookToken: string | null = null;
  let warning: string | undefined;
  if (provider === "asaas") {
    const origin = await publicOrigin();
    if (origin) {
      webhookToken = randomBytes(24).toString("hex");
      const user = await requireUser();
      try {
        await asaas.createWebhook(token, {
          url: webhookUrl(origin, "asaas", store.id),
          email: user.email,
          authToken: webhookToken,
        });
      } catch {
        webhookToken = null;
        warning =
          "A conta foi conectada, mas não conseguimos ativar o aviso automático de pagamento no Asaas. Os pagamentos continuam sendo conferidos pela página do pedido.";
      }
    }
  }

  const admin = createAdminClient();
  const { error } = await admin.from("store_payment_accounts").upsert({
    store_id: store.id,
    provider,
    access_token: token,
    webhook_token: webhookToken,
    account_label: label.slice(0, 120),
    live_mode: liveMode,
    connected_at: new Date().toISOString(),
  });
  if (error) return { message: "Não foi possível salvar a conta. Tente de novo." };
  await admin.from("stores").update({ pix_provider: provider }).eq("id", store.id);

  revalidatePath("/painel/financeiro", "layout");
  return {
    ok: true,
    message: liveMode
      ? "Pronto! Seus clientes já podem pagar com Pix na hora."
      : "Conta de testes conectada. Os pagamentos são simulados: troque pela chave de produção antes de vender.",
    warning,
  };
}

export async function disconnectPixAccount(): Promise<ConnectState> {
  const { store, role } = await requireMyStore();
  if (role !== "owner") return { message: "Só o dono da loja pode desconectar a conta." };
  if (!isAdminConfigured) return { message: "Falta configurar a chave secreta do Supabase no servidor." };
  const admin = createAdminClient();
  await admin.from("stores").update({ pix_provider: null }).eq("id", store.id);
  await admin.from("store_payment_accounts").delete().eq("store_id", store.id);
  revalidatePath("/painel/financeiro", "layout");
  return { ok: true, message: "Conta desconectada. O site voltou a oferecer só pagamento na entrega." };
}
