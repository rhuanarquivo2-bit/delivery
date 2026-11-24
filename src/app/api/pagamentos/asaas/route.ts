import { isAdminConfigured } from "@/lib/supabase/admin";
import { getWebhookToken, syncByExternalId } from "@/lib/payments";

/**
 * Aviso de pagamento do Asaas (webhook criado quando a loja conecta a conta).
 * O Asaas devolve o authToken que definimos no header asaas-access-token. Mesmo assim,
 * o pagamento é sempre consultado de novo na API com a chave da loja.
 */
export async function POST(request: Request) {
  const storeId = new URL(request.url).searchParams.get("loja") ?? "";
  if (!isAdminConfigured || !/^[0-9a-f-]{36}$/i.test(storeId)) return new Response("ok");

  const expected = await getWebhookToken(storeId);
  const received = request.headers.get("asaas-access-token");
  if (expected && received && received !== expected) return new Response("token inválido", { status: 401 });

  const body = (await request.json().catch(() => null)) as { event?: string; payment?: { id?: string } } | null;
  const id = body?.payment?.id;
  if (id && /^[\w-]{1,60}$/.test(id) && body?.event?.startsWith("PAYMENT_")) {
    try {
      await syncByExternalId("asaas", storeId, id);
    } catch (err) {
      console.error("webhook asaas", err);
      return new Response("erro", { status: 500 });
    }
  }
  return new Response("ok");
}
