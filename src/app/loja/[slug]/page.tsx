import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Bike, Clock, MapPin, MessageCircle, UtensilsCrossed } from "lucide-react";
import { DemoStoreBanner } from "@/components/loja/demo-banner";
import { ActiveOrderBanner, MyOrdersLink } from "@/components/loja/my-orders-shortcut";
import { StoreMenu } from "@/components/loja/store-menu";
import { getBestSellers, getMenu } from "@/lib/menu";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { isOpenNow, shortTime, WEEKDAYS } from "@/lib/hours";
import { scheduleOptions } from "@/lib/schedule";
import { getPublicStore } from "@/lib/stores";
import { cn, formatBRL } from "@/lib/utils";

export async function generateMetadata({ params }: PageProps<"/loja/[slug]">): Promise<Metadata> {
  if (!isSupabaseConfigured) return {};
  const { slug } = await params;
  const data = await getPublicStore(slug);
  if (!data) return {};
  return {
    title: { absolute: `${data.store.name} · Peça online` },
    description: data.store.description ?? `Faça seu pedido na ${data.store.name}.`,
  };
}

export default async function LojaPage({ params }: PageProps<"/loja/[slug]">) {
  if (!isSupabaseConfigured) notFound();
  const { slug } = await params;
  const data = await getPublicStore(slug);
  if (!data) notFound();

  const { store, hours, zones } = data;
  const [menu, bestSellers] = await Promise.all([getMenu(store.id, { publicOnly: true }), getBestSellers(store.id)]);
  const open = isOpenNow(hours, store.open_override);
  const nextSlot = store.accepts_scheduled
    ? (scheduleOptions({
        hours,
        override: store.open_override,
        prepMinutes: store.prep_time_minutes,
        daysAhead: store.schedule_days_ahead,
      })[0] ?? null)
    : null;
  const activeZones = zones.filter((z) => z.active);
  const minFee = activeZones.length ? Math.min(...activeZones.map((z) => z.fee_cents)) : null;
  const address = [
    [store.address_street, store.address_number].filter(Boolean).join(", "),
    store.address_district,
    [store.address_city, store.address_state].filter(Boolean).join(" - "),
  ]
    .filter(Boolean)
    .join(" · ");
  const whatsapp = store.whatsapp ? `https://wa.me/55${store.whatsapp.replace(/^55/, "")}` : null;

  return (
    <div className="flex-1" style={{ "--brand": store.primary_color } as React.CSSProperties}>
      {store.is_demo ? <DemoStoreBanner /> : null}
      <div className="h-32 bg-brand sm:h-44" />
      <main className="mx-auto -mt-14 max-w-3xl px-4 pb-28">
        <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7">
          <div className="flex items-start gap-4">
            <div className="relative size-20 shrink-0 overflow-hidden rounded-2xl border-4 border-card bg-muted shadow-sm sm:size-24">
              {store.logo_url ? (
                <Image src={store.logo_url} alt={`Logo ${store.name}`} fill sizes="96px" className="object-cover" priority />
              ) : (
                <div className="flex size-full items-center justify-center bg-brand text-3xl font-bold text-brand-foreground">
                  {store.name.slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{store.name}</h1>
                <span className="hidden sm:block">
                  <MyOrdersLink slug={store.slug} />
                </span>
              </div>
              <span
                className={cn(
                  "mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
                  open ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700",
                )}
              >
                <span className={cn("size-1.5 rounded-full", open ? "bg-emerald-500" : "bg-red-500")} />
                {open ? "Aberto agora" : "Fechado no momento"}
              </span>
            </div>
          </div>

          <div className="mt-3 sm:hidden">
            <MyOrdersLink slug={store.slug} />
          </div>

          {store.description ? <p className="mt-4 text-muted-foreground">{store.description}</p> : null}

          <div className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
            <div className="flex items-center gap-2">
              <Clock className="size-4 text-brand" />
              <span>{store.prep_time_minutes} min em média</span>
            </div>
            <div className="flex items-center gap-2">
              <Bike className="size-4 text-brand" />
              <span>
                {minFee === null ? "Entrega a combinar" : minFee === 0 ? "Entrega grátis em alguns bairros" : `Entrega a partir de ${formatBRL(minFee)}`}
              </span>
            </div>
            {store.min_order_cents > 0 ? (
              <div className="flex items-center gap-2">
                <UtensilsCrossed className="size-4 text-brand" />
                <span>Pedido mínimo {formatBRL(store.min_order_cents)}</span>
              </div>
            ) : null}
          </div>
        </section>

        <ActiveOrderBanner storeId={store.id} slug={store.slug} />

        {!open ? (
          nextSlot ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Estamos fechados agora, mas você já pode <strong>agendar seu pedido</strong>. Primeiro horário:{" "}
              {nextSlot.label.toLowerCase()} às {nextSlot.slots[0].label}.
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              Estamos fechados agora. Você pode ver o cardápio, mas os pedidos abrem no próximo horário de funcionamento.
            </div>
          )
        ) : store.accepts_scheduled ? (
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Quer para mais tarde? Você pode agendar o pedido na hora de finalizar.
          </p>
        ) : null}

        <StoreMenu
          slug={store.slug}
          storeName={store.name}
          categories={menu}
          canOrder={open || nextSlot !== null}
          promoPopup={store.show_promo_popup}
          bestSellers={bestSellers}
        />

        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          <section className="rounded-3xl border border-border bg-card p-6">
            <h2 className="flex items-center gap-2 font-semibold">
              <Clock className="size-4 text-brand" /> Horários
            </h2>
            <ul className="mt-3 grid gap-1.5 text-sm">
              {WEEKDAYS.map((day, i) => {
                const h = hours.find((x) => x.weekday === i);
                return (
                  <li key={day} className="flex justify-between">
                    <span className="text-muted-foreground">{day}</span>
                    <span className="font-medium">
                      {h ? `${shortTime(h.opens_at)} às ${shortTime(h.closes_at)}` : "Fechado"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="rounded-3xl border border-border bg-card p-6">
            <h2 className="flex items-center gap-2 font-semibold">
              <MapPin className="size-4 text-brand" /> Onde estamos
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">{address || "Endereço não informado."}</p>
            {whatsapp ? (
              <a
                href={whatsapp}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-brand hover:underline"
              >
                <MessageCircle className="size-4" /> Falar no WhatsApp
              </a>
            ) : null}
            {activeZones.length ? (
              <details className="mt-4 text-sm">
                <summary className="cursor-pointer font-medium">Bairros atendidos ({activeZones.length})</summary>
                <ul className="mt-2 grid gap-1">
                  {activeZones.map((z) => (
                    <li key={z.id} className="flex justify-between">
                      <span className="text-muted-foreground">{z.neighborhood}</span>
                      <span>{z.fee_cents ? formatBRL(z.fee_cents) : "Grátis"}</span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </section>
        </div>
      </main>
    </div>
  );
}
