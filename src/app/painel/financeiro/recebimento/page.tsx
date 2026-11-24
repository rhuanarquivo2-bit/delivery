import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PixAccountForm } from "@/components/painel/financeiro/pix-account-form";
import { Alert } from "@/components/ui/alert";
import { requireMyStore } from "@/lib/stores";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";

export const metadata = { title: "Receber Pix online" };

export default async function RecebimentoPage() {
  const { store, role } = await requireMyStore();

  let account: { provider: "mercadopago" | "asaas"; account_label: string | null; live_mode: boolean; connected_at: string } | null =
    null;
  if (isAdminConfigured) {
    const { data } = await createAdminClient()
      .from("store_payment_accounts")
      .select("provider, account_label, live_mode, connected_at")
      .eq("store_id", store.id)
      .maybeSingle();
    account = data;
  }

  return (
    <div className="grid max-w-3xl gap-6">
      <div>
        <Link href="/painel/financeiro" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> Financeiro
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Receber Pix online</h1>
        <p className="text-muted-foreground">
          Conecte a conta da loja no Mercado Pago ou no Asaas. O cliente paga na hora pelo site e o dinheiro cai direto na
          sua conta.
        </p>
      </div>
      {store.is_demo ? (
        <Alert tone="info">
          Na demonstração o Pix é simulado: o cliente vê o QR Code e um botão &quot;Simular pagamento&quot;. Na sua loja de
          verdade, é aqui que você conecta o Mercado Pago ou o Asaas.
        </Alert>
      ) : !isAdminConfigured ? (
        <Alert tone="info">
          Para ativar o Pix online, falta configurar a chave secreta do Supabase (SUPABASE_SECRET_KEY) no servidor. Veja o
          passo a passo em docs/configurar-supabase.md.
        </Alert>
      ) : role !== "owner" ? (
        <Alert tone="info">Só o dono da loja pode conectar ou trocar a conta de recebimento.</Alert>
      ) : (
        <PixAccountForm account={account} />
      )}
    </div>
  );
}
