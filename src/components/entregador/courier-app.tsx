"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Banknote, Check, CreditCard, MapPin, MessageCircle, QrCode, RefreshCw, StickyNote } from "lucide-react";
import { courierAction } from "@/app/entregador/[token]/actions";
import { Button } from "@/components/ui/button";
import { collectInstruction, mapsUrl, settlement, whatsappUrl } from "@/lib/couriers";
import { formatDay } from "@/lib/finance";
import type { CourierOrder, CourierPortal } from "@/lib/types";
import { cn, formatBRL } from "@/lib/utils";

const time = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(iso))
    : "";

const TONES = {
  paid: { box: "border-emerald-200 bg-emerald-50 text-emerald-900", icon: Check },
  cash: { box: "border-amber-200 bg-amber-50 text-amber-950", icon: Banknote },
  card: { box: "border-sky-200 bg-sky-50 text-sky-950", icon: CreditCard },
  pix: { box: "border-violet-200 bg-violet-50 text-violet-950", icon: QrCode },
};

export function CourierApp({ token, portal }: { token: string; portal: CourierPortal }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();

  // Atualiza sozinho: pedidos novos chegam quando a loja passa para ele.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 20000);
    return () => window.clearInterval(id);
  }, [router]);

  const today = portal.days.find((d) => d.day === portal.today);
  const firstName = portal.courier.name.split(" ")[0];

  return (
    <main className="mx-auto grid w-full max-w-lg gap-5 px-4 pb-16 pt-5">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{portal.store.name}</p>
          <h1 className="text-2xl font-bold tracking-tight">Olá, {firstName}!</h1>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={refreshing}
          onClick={() => startRefresh(() => router.refresh())}
          aria-label="Atualizar"
        >
          <RefreshCw className={cn(refreshing && "animate-spin")} /> Atualizar
        </Button>
      </header>

      <section className="grid grid-cols-3 gap-2">
        <Tile label="Entregas hoje" value={String(today?.deliveries ?? 0)} />
        <Tile label="Ganhos hoje" value={formatBRL(today?.earned_cents ?? 0)} />
        <Tile label="Dinheiro em mãos" value={formatBRL(today?.cash_cents ?? 0)} />
      </section>

      <section className="grid gap-3">
        <h2 className="text-lg font-bold">
          Para entregar {portal.open.length ? <span className="text-muted-foreground">({portal.open.length})</span> : null}
        </h2>
        {portal.open.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            Nenhuma entrega com você agora. Quando a loja passar um pedido, ele aparece aqui.
          </p>
        ) : (
          portal.open.map((o) => <OpenOrder key={o.id} token={token} order={o} city={portal.store.address_city} />)
        )}
      </section>

      {portal.delivered_today.length ? (
        <section className="grid gap-2">
          <h2 className="text-lg font-bold">Entregues hoje</h2>
          <ul className="divide-y divide-border rounded-2xl border border-border bg-card text-sm">
            {portal.delivered_today.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span>
                  <span className="font-semibold">#{o.number}</span> · {o.address_district}
                  <span className="block text-xs text-muted-foreground">
                    {time(o.delivered_at)} · {o.payment_status === "paid" ? "pago online" : collectInstruction(o).title.replace("Cobrar ", "")}
                  </span>
                </span>
                <span className="font-semibold tabular-nums">{formatBRL(o.courier_fee_cents ?? 0)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {today ? (
        <section className="grid gap-2 rounded-2xl border border-border bg-card p-4 text-sm">
          <h2 className="text-base font-bold">Acerto de hoje</h2>
          <Row label={`Taxas (${today.deliveries} ${today.deliveries === 1 ? "entrega" : "entregas"})`} value={formatBRL(today.fees_cents)} />
          {today.daily_rate_cents ? <Row label="Diária" value={formatBRL(today.daily_rate_cents)} /> : null}
          <Row label="Você ganhou" value={formatBRL(today.earned_cents)} strong />
          <Row label="Dinheiro recebido dos clientes" value={formatBRL(today.cash_cents)} />
          {today.card_cents ? <Row label="Cartão (na maquininha da loja)" value={formatBRL(today.card_cents)} /> : null}
          <p className="mt-1 rounded-xl bg-muted/70 px-3 py-2 font-semibold">
            {today.paid_at ? "Acerto de hoje já foi pago." : settlement(today).text}
          </p>
        </section>
      ) : null}

      {portal.days.length ? (
        <section className="grid gap-2">
          <h2 className="text-lg font-bold">Últimos 7 dias</h2>
          <table className="w-full rounded-2xl border border-border bg-card text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 pb-1 pt-3 font-semibold">Dia</th>
                <th className="px-2 pb-1 pt-3 text-right font-semibold">Entregas</th>
                <th className="px-2 pb-1 pt-3 text-right font-semibold">Ganhos</th>
                <th className="px-4 pb-1 pt-3 text-right font-semibold">Acerto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {portal.days.map((d) => (
                <tr key={d.day}>
                  <td className="px-4 py-2.5">{formatDay(d.day)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{d.deliveries}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{formatBRL(d.earned_cents)}</td>
                  <td className={cn("px-4 py-2.5 text-right", d.paid_at ? "text-emerald-700" : "text-muted-foreground")}>
                    {d.paid_at ? "Pago" : "Em aberto"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {portal.store.whatsapp ? (
        <a
          href={whatsappUrl(portal.store.whatsapp)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-brand hover:underline"
        >
          <MessageCircle className="size-4" /> Falar com a loja
        </a>
      ) : null}
      <p className="text-center text-xs text-muted-foreground">
        Este link é só seu. Não compartilhe. A página se atualiza sozinha.
      </p>
    </main>
  );
}

function OpenOrder({ token, order, city }: { token: string; order: CourierOrder; city: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const collect = collectInstruction(order);
  const Tone = TONES[collect.tone];
  const out = order.status === "out_for_delivery";
  const atStore = order.status === "pending";

  const run = (action: "dispatch" | "deliver") =>
    startTransition(async () => {
      setError(null);
      const r = await courierAction(token, order.id, action);
      if (!r.ok) setError(r.message);
      setConfirming(false);
      router.refresh();
    });

  return (
    <article className={cn("grid gap-3 rounded-2xl border bg-card p-4 shadow-xs", out ? "border-brand" : "border-border")}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-lg font-bold">#{order.number}</span>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-semibold",
            out ? "bg-brand text-brand-foreground" : "bg-muted text-muted-foreground",
          )}
        >
          {out ? "Na rua" : atStore ? "Aguardando a loja aceitar" : order.status === "ready" ? "Pronto na loja" : "Em preparo"}
        </span>
      </div>

      <div className="grid gap-0.5">
        <p className="text-base font-semibold">
          {order.address_street}, {order.address_number}
        </p>
        <p className="text-sm text-muted-foreground">
          {[order.address_complement, order.address_district].filter(Boolean).join(" · ")}
        </p>
        {order.address_reference ? <p className="text-sm">Ref.: {order.address_reference}</p> : null}
        <p className="text-sm">
          {order.customer_name} · {order.items_count} {order.items_count === 1 ? "item" : "itens"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <a
          href={mapsUrl(order, city)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border text-sm font-semibold hover:bg-muted"
        >
          <MapPin className="size-4" /> Mapa
        </a>
        <a
          href={whatsappUrl(order.customer_phone)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border text-sm font-semibold hover:bg-muted"
        >
          <MessageCircle className="size-4" /> Cliente
        </a>
      </div>

      <div className={cn("flex gap-3 rounded-xl border px-3 py-2.5", Tone.box)}>
        <Tone.icon className="mt-0.5 size-5 shrink-0" />
        <div>
          <p className="font-bold">{collect.title}</p>
          <p className="text-sm">{collect.detail}</p>
        </div>
      </div>

      {order.notes ? (
        <p className="flex gap-2 text-sm">
          <StickyNote className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> {order.notes}
        </p>
      ) : null}

      <p className="text-xs text-muted-foreground">Sua taxa nesta entrega: {formatBRL(order.courier_fee_cents ?? 0)}</p>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {atStore ? null : !out ? (
        <Button size="lg" className="h-12" disabled={pending} onClick={() => run("dispatch")}>
          {pending ? "..." : "Saí para entrega"}
        </Button>
      ) : confirming ? (
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Button size="lg" className="h-12 bg-emerald-600 hover:bg-emerald-700" disabled={pending} onClick={() => run("deliver")}>
            {pending ? "..." : `Confirmar entrega do #${order.number}`}
          </Button>
          <Button size="lg" variant="ghost" className="h-12" onClick={() => setConfirming(false)}>
            Voltar
          </Button>
        </div>
      ) : (
        <Button size="lg" className="h-12" onClick={() => setConfirming(true)}>
          <Check /> Entreguei
        </Button>
      )}
    </article>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-bold tracking-tight tabular-nums">{value}</p>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("flex justify-between", strong && "font-bold")}>
      <span className={cn(!strong && "text-muted-foreground")}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
