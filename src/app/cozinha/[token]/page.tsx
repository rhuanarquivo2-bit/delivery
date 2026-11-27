import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { fixedIcon } from "@/lib/push/app-icon";
import { KitchenMessage } from "@/components/cozinha/kitchen-message";
import { KitchenScreen } from "@/components/cozinha/kitchen-screen";
import { kitchenErrorText, type KitchenBoard } from "@/lib/kitchen";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: PageProps<"/cozinha/[token]">): Promise<Metadata> {
  const { token } = await params;
  return {
    title: { absolute: "Cozinha" },
    robots: { index: false, follow: false },
    ...(TOKEN.test(token)
      ? {
          manifest: `/api/manifest/cozinha/${token}`,
          appleWebApp: { capable: true, title: "Cozinha", statusBarStyle: "black-translucent" as const },
          icons: { apple: fixedIcon("painel", 180) },
        }
      : {}),
  };
}

export const viewport: Viewport = { themeColor: "#09090b" };

/** Tela da cozinha pelo link secreto (tablet/TV sem login). */
export default async function CozinhaLinkPage({ params }: PageProps<"/cozinha/[token]">) {
  if (!isSupabaseConfigured) notFound();
  const { token } = await params;
  if (!TOKEN.test(token)) notFound();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("kitchen_board", { p_token: token });
  if (error || !data) {
    return (
      <KitchenMessage title={error?.message === "link_invalido" ? "Link inválido" : "Cozinha indisponível"}>
        <p>{kitchenErrorText(error?.message)}</p>
      </KitchenMessage>
    );
  }
  return <KitchenScreen initialBoard={data as KitchenBoard} token={token} />;
}
