import { StoreTracking } from "@/components/loja/store-tracking";
import { getPublicStore } from "@/lib/stores";
import { isSupabaseConfigured } from "@/lib/supabase/env";

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
