import type { Metadata } from "next";
import { fixedIcon } from "@/lib/push/app-icon";
import { Alert } from "@/components/ui/alert";
import { DemoBar } from "@/components/painel/demo-bar";
import { PainelShell } from "@/components/painel/shell";
import { createClient } from "@/lib/supabase/server";
import { storeUrl } from "@/lib/tenant";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getMyStore, requireUser } from "@/lib/stores";

export const metadata: Metadata = {
  title: "Painel",
  manifest: "/api/manifest/painel",
  appleWebApp: { capable: true, title: "Painel", statusBarStyle: "default" },
  icons: { apple: fixedIcon("painel", 180) },
};

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

  let demoBar: React.ReactNode = null;
  if (mine?.store.is_demo) {
    const supabase = await createClient();
    const { data: courier } = await supabase
      .from("couriers")
      .select("access_token")
      .eq("store_id", mine.store.id)
      .eq("active", true)
      .order("created_at")
      .limit(1)
      .maybeSingle();
    demoBar = (
      <DemoBar
        storeHref={storeUrl(mine.store.slug)}
        courierHref={courier ? `/entregador/${courier.access_token}` : null}
      />
    );
  }

  return (
    <PainelShell
      storeName={mine?.store.name ?? null}
      email={mine?.store.is_demo ? "Visitante da demonstração" : user.email}
      brandColor={mine?.store.primary_color}
      topBar={demoBar}
    >
      {children}
    </PainelShell>
  );
}
