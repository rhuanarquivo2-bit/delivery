import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { MyOrders } from "@/components/loja/my-orders";
import { getPublicStore } from "@/lib/stores";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = { title: { absolute: "Meus pedidos" }, robots: { index: false } };

export default async function MeusPedidosPage({ params }: PageProps<"/loja/[slug]/pedidos">) {
  if (!isSupabaseConfigured) notFound();
  const { slug } = await params;
  const data = await getPublicStore(slug);
  if (!data) notFound();
  const { store } = data;
  return (
    <div className="flex-1" style={{ "--brand": store.primary_color } as React.CSSProperties}>
      <main className="mx-auto grid w-full max-w-xl gap-5 px-4 py-6">
        <Link
          href={`/loja/${store.slug}`}
          className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium hover:border-brand hover:text-brand"
        >
          <ArrowLeft className="size-4" /> Voltar ao cardápio
        </Link>
        <div>
          <p className="text-sm text-muted-foreground">{store.name}</p>
          <h1 className="text-2xl font-bold tracking-tight">Meus pedidos</h1>
        </div>
        <MyOrders storeId={store.id} slug={store.slug} />
      </main>
    </div>
  );
}
