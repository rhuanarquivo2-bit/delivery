import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CourierApp } from "@/components/entregador/courier-app";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { CourierPortal } from "@/lib/types";

export const metadata: Metadata = { title: { absolute: "Minhas entregas" }, robots: { index: false, follow: false } };

export default async function EntregadorPage({ params }: PageProps<"/entregador/[token]">) {
  if (!isSupabaseConfigured) notFound();
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) notFound();

  const supabase = await createClient();
  const { data } = await supabase.rpc("courier_portal", { p_token: token });
  const portal = data as CourierPortal | null;
  if (!portal) {
    return (
      <main className="mx-auto grid max-w-md flex-1 content-center gap-2 px-6 py-20 text-center">
        <h1 className="text-xl font-bold">Link inválido</h1>
        <p className="text-muted-foreground">
          Este link de entregas não vale mais. Peça o link novo para a loja.
        </p>
      </main>
    );
  }
  return (
    <div className="flex-1" style={{ "--brand": portal.store.primary_color } as React.CSSProperties}>
      <CourierApp token={token} portal={portal} />
    </div>
  );
}
