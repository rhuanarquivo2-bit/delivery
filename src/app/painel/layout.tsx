import type { Metadata } from "next";
import { fixedIcon } from "@/lib/push/app-icon";
import { Alert } from "@/components/ui/alert";
import { AccessEndingBar, AccessSuspended } from "@/components/painel/access-notice";
import { DemoBar } from "@/components/painel/demo-bar";
import { PainelShell } from "@/components/painel/shell";
import { createClient } from "@/lib/supabase/server";
import { storeUrl } from "@/lib/tenant";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getMyStore, requireUser } from "@/lib/stores";
import { storeAccess, WARN_DAYS } from "@/lib/access";
import { getPlatformSettings, isPlatformAdmin } from "@/lib/platform";

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
  const [mine, isAdmin] = await Promise.all([getMyStore(), isPlatformAdmin()]);
  const access = mine ? storeAccess(mine.store) : null;

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

  let content = children;
  let topBar = demoBar;
  if (mine && access && (access.kind === "expired" || access.kind === "blocked" || (access.kind === "active" && access.daysLeft <= WARN_DAYS))) {
    const { support_whatsapp } = await getPlatformSettings();
    if (access.kind === "active") {
      topBar = (
        <AccessEndingBar until={access.until} daysLeft={access.daysLeft} supportWhatsapp={support_whatsapp} storeName={mine.store.name} />
      );
    } else if (!isAdmin) {
      // o administrador da plataforma continua entrando no próprio painel
      content = <AccessSuspended access={access} storeName={mine.store.name} supportWhatsapp={support_whatsapp} />;
    }
  }

  return (
    <PainelShell
      storeName={mine?.store.name ?? null}
      email={mine?.store.is_demo ? "Visitante da demonstração" : user.email}
      brandColor={mine?.store.primary_color}
      topBar={topBar}
      showAdminLink={isAdmin}
      locked={content !== children}
    >
      {content}
    </PainelShell>
  );
}
