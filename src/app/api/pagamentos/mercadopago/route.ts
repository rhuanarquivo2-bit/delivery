import { isAdminConfigured } from "@/lib/supabase/admin";
import { syncByExternalId } from "@/lib/payments";

/**
 * Aviso de pagamento do Mercado Pago (notification_url de cada cobrança).
 * Não confiamos no conteúdo: só usamos o id para consultar o pagamento com o token da loja.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const storeId = url.searchParams.get("loja") ?? "";
  const body = (await request.json().catch(() => null)) as { type?: string; data?: { id?: string | number } } | null;
  const type = body?.type ?? url.searchParams.get("type");
  const id = body?.data?.id ?? url.searchParams.get("data.id");

  if (isAdminConfigured && type === "payment" && id && /^[0-9a-f-]{36}$/i.test(storeId) && /^\d{1,30}$/.test(String(id))) {
    try {
      await syncByExternalId("mercadopago", storeId, String(id));
    } catch (err) {
      console.error("webhook mercadopago", err);
      return new Response("erro", { status: 500 }); // o Mercado Pago tenta de novo
    }
  }
  return new Response("ok");
}
