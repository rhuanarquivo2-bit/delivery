import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckCircle2, MessageCircle, XCircle } from "lucide-react";
import { AutoRefresh } from "@/components/loja/auto-refresh";
import { customerStatusLabel, customerSteps } from "@/lib/order-status";
import { changeDue, PAYMENT_LABELS } from "@/lib/pricing";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { Fulfillment, OrderItem, OrderStatus, PaymentMethod } from "@/lib/types";
import { cn, formatBRL } from "@/lib/utils";

export const metadata: Metadata = { title: { absolute: "Acompanhe seu pedido" }, robots: { index: false } };

type PublicOrder = {
  number: number;
  status: OrderStatus;
  fulfillment: Fulfillment;
  customer_name: string;
  address_street: string | null;
  address_number: string | null;
  address_district: string | null;
  subtotal_cents: number;
  delivery_fee_cents: number;
  discount_cents: number;
  total_cents: number;
  payment_method: PaymentMethod;
  change_for_cents: number | null;
  created_at: string;
  store: { name: string; slug: string; whatsapp: string | null; primary_color: string; prep_time_minutes: number };
  items: OrderItem[];
} & Record<"accepted_at" | "ready_at" | "dispatched_at" | "delivered_at" | "cancelled_at", string | null>;

const STEP_TIME: Partial<Record<OrderStatus, keyof PublicOrder>> = {
  pending: "created_at",
  preparing: "accepted_at",
  ready: "ready_at",
  out_for_delivery: "dispatched_at",
  delivered: "delivered_at",
};

const time = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(
        new Date(iso),
      )
    : null;

export default async function PedidoPage({ params }: PageProps<"/loja/[slug]/pedido/[token]">) {
  if (!isSupabaseConfigured) notFound();
  const { slug, token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) notFound();

  const supabase = await createClient();
  const { data } = await supabase.rpc("get_public_order", { p_token: token });
  const order = data as PublicOrder | null;
  if (!order || order.store.slug !== slug) notFound();

  const steps = customerSteps(order.fulfillment);
  const cancelled = order.status === "cancelled";
  const currentIndex = steps.indexOf(order.status === "ready" && order.fulfillment === "delivery" ? "preparing" : order.status);
  const finished = order.status === "delivered" || cancelled;
  const change = changeDue(order.total_cents, order.change_for_cents);
  const whatsapp = order.store.whatsapp ? `https://wa.me/55${order.store.whatsapp.replace(/^55/, "")}` : null;

  return (
    <div className="flex-1" style={{ "--brand": order.store.primary_color } as React.CSSProperties}>
      {!finished ? <AutoRefresh seconds={15} /> : null}
      <main className="mx-auto grid w-full max-w-xl gap-5 px-4 py-8">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">{order.store.name}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Pedido #{order.number}</h1>
          <p
            className={cn(
              "mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold",
              cancelled ? "bg-red-50 text-red-700" : "bg-brand/10 text-brand",
            )}
          >
            {cancelled ? <XCircle className="size-4" /> : <CheckCircle2 className="size-4" />}
            {customerStatusLabel(order.status, order.fulfillment)}
          </p>
          {order.status === "pending" ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Recebemos seu pedido! Assim que a loja aceitar, ele vai para o preparo.
            </p>
          ) : null}
        </div>

        {!cancelled ? (
          <ol className="grid gap-0 rounded-2xl border border-border bg-card p-5">
            {steps.map((step, i) => {
              const done = i <= currentIndex;
              const at = time(order[STEP_TIME[step]!] as string | null);
              return (
                <li key={step} className="relative flex gap-3 pb-5 last:pb-0">
                  {i < steps.length - 1 ? (
                    <span
                      className={cn("absolute left-[9px] top-5 h-full w-0.5", i < currentIndex ? "bg-brand" : "bg-border")}
                    />
                  ) : null}
                  <span
                    className={cn(
                      "relative z-10 mt-0.5 size-5 shrink-0 rounded-full border-2",
                      done ? "border-brand bg-brand" : "border-border bg-card",
                    )}
                  />
                  <div className="flex flex-1 justify-between text-sm">
                    <span className={cn(done ? "font-semibold" : "text-muted-foreground")}>
                      {customerStatusLabel(step, order.fulfillment)}
                    </span>
                    {done && at ? <span className="text-muted-foreground">{at}</span> : null}
                  </div>
                </li>
              );
            })}
          </ol>
        ) : null}

        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-semibold">Itens</h2>
          <ul className="mt-2 divide-y divide-border text-sm">
            {order.items.map((item, i) => (
              <li key={i} className="flex justify-between gap-3 py-2">
                <div>
                  <p className="font-medium">
                    {item.quantity}x {item.product_name}
                    {item.size_name ? ` (${item.size_name})` : ""}
                  </p>
                  {item.flavors?.length ? (
                    <p className="text-xs text-muted-foreground">Sabores: {item.flavors.join(" + ")}</p>
                  ) : null}
                  {item.options.length ? (
                    <p className="text-xs text-muted-foreground">{item.options.map((o) => o.name).join(", ")}</p>
                  ) : null}
                  {item.notes ? <p className="text-xs text-muted-foreground">Obs.: {item.notes}</p> : null}
                </div>
                <span className="shrink-0">{formatBRL(item.total_cents)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-2 grid gap-1 border-t border-border pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd>{formatBRL(order.subtotal_cents)}</dd>
            </div>
            {order.fulfillment === "delivery" ? (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Entrega</dt>
                <dd>{order.delivery_fee_cents ? formatBRL(order.delivery_fee_cents) : "Grátis"}</dd>
              </div>
            ) : null}
            <div className="flex justify-between text-base font-bold">
              <dt>Total</dt>
              <dd>{formatBRL(order.total_cents)}</dd>
            </div>
          </dl>
        </section>

        <section className="grid gap-1 rounded-2xl border border-border bg-card p-5 text-sm">
          <p>
            <span className="text-muted-foreground">Pagamento: </span>
            {PAYMENT_LABELS[order.payment_method]}
            {change !== null ? ` · troco para ${formatBRL(order.change_for_cents!)} (${formatBRL(change)} de troco)` : ""}
          </p>
          <p>
            <span className="text-muted-foreground">{order.fulfillment === "delivery" ? "Entrega em: " : "Retirada na loja"}</span>
            {order.fulfillment === "delivery"
              ? `${order.address_street}, ${order.address_number} · ${order.address_district}`
              : ""}
          </p>
        </section>

        {whatsapp ? (
          <a
            href={whatsapp}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-brand hover:underline"
          >
            <MessageCircle className="size-4" /> Falar com a loja no WhatsApp
          </a>
        ) : null}
        <p className="text-center text-xs text-muted-foreground">
          Guarde este link para acompanhar seu pedido. A página se atualiza sozinha.
        </p>
      </main>
    </div>
  );
}
