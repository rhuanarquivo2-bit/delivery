import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { hasAccess, storeAccess } from "@/lib/access";
import { storeUrl } from "@/lib/tenant";
import { CheckoutForm } from "@/components/loja/checkout-form";
import { isOpenNow } from "@/lib/hours";
import { getMenu } from "@/lib/menu";
import { getPublicStore } from "@/lib/stores";
import { DemoStoreBanner } from "@/components/loja/demo-banner";
import { isAdminConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = { title: { absolute: "Finalizar pedido" } };

export default async function CheckoutPage({ params }: PageProps<"/loja/[slug]/checkout">) {
  if (!isSupabaseConfigured) notFound();
  const { slug } = await params;
  const data = await getPublicStore(slug);
  if (!data) notFound();
  const { store, hours, zones } = data;
  if (!hasAccess(storeAccess(store))) redirect(storeUrl(store.slug));
  const menu = await getMenu(store.id, { publicOnly: true });

  return (
    <div className="flex-1" style={{ "--brand": store.primary_color } as React.CSSProperties}>
      {store.is_demo ? <DemoStoreBanner /> : null}
      <CheckoutForm
        store={{
          id: store.id,
          slug: store.slug,
          name: store.name,
          min_order_cents: store.min_order_cents,
          prep_time_minutes: store.prep_time_minutes,
          // Pix online precisa da chave secreta no servidor para gerar a cobrança
          pix_provider: isAdminConfigured ? (store.pix_provider ?? null) : null,
          open_override: store.open_override,
          accepts_scheduled: store.accepts_scheduled,
          schedule_days_ahead: store.schedule_days_ahead,
        }}
        open={isOpenNow(hours, store.open_override)}
        hours={hours}
        zones={zones.filter((z) => z.active).map((z) => ({ id: z.id, name: z.neighborhood, fee: z.fee_cents }))}
        menu={menu}
      />
    </div>
  );
}
