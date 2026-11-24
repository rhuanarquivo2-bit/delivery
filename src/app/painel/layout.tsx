import { Alert } from "@/components/ui/alert";
import { PainelShell } from "@/components/painel/shell";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getMyStore, requireUser } from "@/lib/stores";

export const metadata = { title: "Painel" };

export default async function PainelLayout({ children }: LayoutProps<"/painel">) {
  if (!isSupabaseConfigured) {
    return (
      <main className="mx-auto max-w-lg px-6 py-20">
        <Alert>
          O banco de dados ainda não está conectado. Siga o passo a passo em{" "}
          <code className="font-mono text-xs">docs/configurar-supabase.md</code>.
        </Alert>
      </main>
    );
  }
  const user = await requireUser();
  const mine = await getMyStore();
  return (
    <PainelShell storeName={mine?.store.name ?? null} email={user.email} brandColor={mine?.store.primary_color}>
      {children}
    </PainelShell>
  );
}
