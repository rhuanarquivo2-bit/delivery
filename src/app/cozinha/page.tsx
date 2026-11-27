import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { fixedIcon } from "@/lib/push/app-icon";
import { KitchenMessage } from "@/components/cozinha/kitchen-message";
import { KitchenScreen } from "@/components/cozinha/kitchen-screen";
import { kitchenErrorText, type KitchenBoard } from "@/lib/kitchen";
import { getMyStore, requireUser } from "@/lib/stores";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: { absolute: "Cozinha" },
  robots: { index: false, follow: false },
  manifest: "/api/manifest/cozinha",
  appleWebApp: { capable: true, title: "Cozinha", statusBarStyle: "black-translucent" },
  icons: { apple: fixedIcon("painel", 180) },
};

export const viewport: Viewport = { themeColor: "#09090b" };

/** Tela da cozinha com o login do painel (pedidos ao vivo). */
export default async function CozinhaPage() {
  if (!isSupabaseConfigured) notFound();
  await requireUser();
  const mine = await getMyStore();
  if (!mine) redirect("/painel");

  const supabase = await createClient();
  const [{ data, error }, { data: link }] = await Promise.all([
    supabase.rpc("kitchen_board", { p_store_id: mine.store.id }),
    supabase.from("kitchen_links").select("access_token").eq("store_id", mine.store.id).maybeSingle(),
  ]);
  if (error || !data) {
    return (
      <KitchenMessage title="Cozinha indisponível">
        <p>{kitchenErrorText(error?.message)}</p>
        <Link href="/painel" className="mt-4 inline-block font-semibold text-white underline">
          Voltar ao painel
        </Link>
      </KitchenMessage>
    );
  }
  return (
    <KitchenScreen
      initialBoard={data as KitchenBoard}
      token={null}
      initialLink={(link?.access_token as string | undefined) ?? null}
    />
  );
}
