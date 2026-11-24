import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckoutForm } from "@/components/loja/checkout-form";
import { isOpenNow } from "@/lib/hours";
import { getMenu } from "@/lib/menu";
import { getPublicStore } from "@/lib/stores";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = { title: { absolute: "Finalizar pedido" } };

export default async function CheckoutPage({ params }: PageProps<"/loja/[slug]/checkout">) {
  if (!isSupabaseConfigured) notFound();
  const { slug } = await params;
  const data = await getPublicStore(slug);
  if (!data) notFound();
  const { store, hours, zones } = data;
  const menu = await getMenu(store.id, { publicOnly: true });

  return (
    <div className="flex-1" style={{ "--brand": store.primary_color } as React.CSSProperties}>
      <CheckoutForm
        store={{
          id: store.id,
          slug: store.slug,
          name: store.name,
          min_order_cents: store.min_order_cents,
          prep_time_minutes: store.prep_time_minutes,
          pix_provider: store.pix_provider ?? null,
        }}
        open={isOpenNow(hours, store.open_override)}
        zones={zones.filter((z) => z.active).map((z) => ({ id: z.id, name: z.neighborhood, fee: z.fee_cents }))}
        menu={menu}
      />
    </div>
  );
}
