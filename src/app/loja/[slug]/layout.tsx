import type { Metadata } from "next";
import { storeIconUrl } from "@/lib/push/app-icon";
import { StoreTracking } from "@/components/loja/store-tracking";
import { getPublicStore } from "@/lib/stores";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/** Permite instalar o site da loja na tela inicial (no iPhone, é o que libera as notificações). */
export async function generateMetadata({ params }: LayoutProps<"/loja/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const store = isSupabaseConfigured ? (await getPublicStore(slug))?.store : null;
  if (!store) return {};
  return {
    manifest: `/api/manifest/loja/${store.slug}`,
    appleWebApp: { capable: true, title: store.name, statusBarStyle: "default" },
    icons: { apple: storeIconUrl(store.slug, 180, store.logo_url) },
  };
}

/** Site da loja: carrega o Facebook Pixel e o Google Analytics, se a loja configurou. */
export default async function LojaLayout({ children, params }: LayoutProps<"/loja/[slug]">) {
  const { slug } = await params;
  const store = isSupabaseConfigured ? (await getPublicStore(slug))?.store : null;
  const tracking = store && (store.facebook_pixel_id || store.google_analytics_id);
  return (
    <>
      {children}
      {tracking ? <StoreTracking pixelId={store.facebook_pixel_id} gaId={store.google_analytics_id} /> : null}
    </>
  );
}
