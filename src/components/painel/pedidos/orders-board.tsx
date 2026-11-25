"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Bell,
  BellOff,
  Bike,
  CalendarClock,
  CheckCircle2,
  Clock,
  MessageCircle,
  Printer,
  Store as StoreIcon,
  X,
} from "lucide-react";
import { assignCourier } from "@/app/painel/motoboys/actions";
import { setWhatsappPixPaid, updateOrderStatus } from "@/app/painel/pedidos/actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { nextStatus, nextStatusAction, STATUS_LABELS } from "@/lib/order-status";
import { PAYMENT_LABELS } from "@/lib/pricing";
import { formatScheduled } from "@/lib/schedule";
import { createClient } from "@/lib/supabase/client";
import type { Order, OrderStatus } from "@/lib/types";
import { cn, formatBRL } from "@/lib/utils";
import { formatPhoneBR, OrderItemsList, OrderTotals, orderAddress } from "./order-details";
import { useAlertSound } from "./use-alert-sound";

const COLUMNS: { key: string; title: string; statuses: OrderStatus[] }[] = [
  { key: "novos", title: "Novos", statuses: ["pending"] },
  { key: "preparo", title: "Em preparo", statuses: ["preparing"] },
  { key: "saida", title: "Prontos e em entrega", statuses: ["ready", "out_for_delivery"] },
  { key: "fim", title: "Concluídos", statuses: ["delivered", "cancelled"] },
];

function minutesAgo(iso: string, now: number) {
  const m = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  if (m < 1) return "agora";
  if (m < 60) return `há ${m} min`;
  return `há ${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
}

/** Pedido agendado: quando o cliente quer receber, em destaque. */
function ScheduledBadge({ order, large }: { order: Order; large?: boolean }) {
  if (!order.scheduled_for) return null;
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-lg bg-amber-100 font-semibold text-amber-900",
        large ? "px-3 py-1.5 text-sm" : "px-2 py-0.5 text-xs",
      )}
    >
      <CalendarClock className={large ? "size-4" : "size-3.5"} />
      Agendado: {formatScheduled(order.scheduled_for)}
    </span>
  );
}

/** Etiqueta do pagamento no cartão do pedido. */
function paymentBadge(order: Order) {
  if (order.payment_method === "pix_whatsapp") {
    return order.payment_status === "paid"
      ? { text: "Pix pago", tone: "bg-emerald-100 text-emerald-800" }
      : { text: "Pix a confirmar", tone: "bg-amber-100 text-amber-900" };
  }
  return order.payment_status === "paid"
    ? { text: "Pago online", tone: "bg-emerald-100 text-emerald-800" }
    : { text: PAYMENT_LABELS[order.payment_method], tone: "bg-muted" };
}

/** Pix online ainda não pago não aparece para a loja. */
const isVisible = (o: Order) => o.payment_status !== "awaiting" && o.payment_status !== "expired";

type CourierOption = { id: string; name: string; active: boolean };

export function OrdersBoard({
  storeId,
  initialOrders,
  couriers,
}: {
  storeId: string;
  initialOrders: Order[];
  couriers: CourierOption[];
}) {
  const [allOrders, setOrders] = useState(initialOrders);
  const orders = useMemo(() => allOrders.filter(isVisible), [allOrders]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState(COLUMNS[0].key);
  // O navegador só libera som depois de um clique, então começa desligado a cada visita.
  const [soundOn, setSoundOn] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [live, setLive] = useState<"connecting" | "on" | "off">("connecting");
  const supabase = useMemo(() => createClient(), []);

  const knownIds = useRef(new Set<string>());
  useEffect(() => {
    knownIds.current = new Set(orders.map((o) => o.id));
  }, [orders]);
  const allIds = useRef(new Set<string>());
  useEffect(() => {
    allIds.current = new Set(allOrders.filter((o) => o.order_items).map((o) => o.id));
  }, [allOrders]);

  const pendingCount = orders.filter((o) => o.status === "pending").length;
  const unlock = useAlertSound(pendingCount > 0, soundOn);

  const upsert = useCallback((order: Order) => {
    setOrders((list) => {
      const existing = list.find((o) => o.id === order.id);
      const merged = { ...existing, ...order, order_items: order.order_items ?? existing?.order_items };
      return existing ? list.map((o) => (o.id === order.id ? merged : o)) : [...list, merged];
    });
  }, []);

  const fetchOrder = useCallback(
    async (id: string) => {
      const { data } = await supabase.from("orders").select("*, order_items(*)").eq("id", id).maybeSingle();
      if (data) {
        const order = data as Order;
        order.order_items = [...(order.order_items ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        upsert(order);
      }
    },
    [supabase, upsert],
  );

  // Pedidos ao vivo.
  useEffect(() => {
    const channel = supabase
      .channel(`pedidos-${storeId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `store_id=eq.${storeId}` },
        (payload) => {
          if (payload.eventType === "INSERT") void fetchOrder((payload.new as Order).id);
          else if (payload.eventType === "UPDATE") {
            const row = payload.new as Order;
            // Pix que acabou de ser pago: busca o pedido completo (com os itens).
            if (isVisible(row) && !allIds.current.has(row.id)) void fetchOrder(row.id);
            else upsert(row);
          }
        },
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED" ? "on" : status === "CLOSED" ? "off" : "connecting"));
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, storeId, fetchOrder, upsert]);

  // Relógio para "há X min" e conferência periódica (caso a conexão ao vivo caia).
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 30000);
    const sync = window.setInterval(async () => {
      const { data } = await supabase
        .from("orders")
        .select("id")
        .eq("store_id", storeId)
        .in("payment_status", ["on_delivery", "paid"])
        .gte("created_at", new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString());
      for (const row of data ?? []) {
        if (!knownIds.current.has(row.id)) void fetchOrder(row.id);
      }
    }, 60000);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(sync);
    };
  }, [supabase, storeId, fetchOrder]);

  // Título da aba pisca com novos pedidos.
  useEffect(() => {
    const base = "Pedidos";
    document.title = pendingCount ? `(${pendingCount}) Novo pedido!` : base;
    return () => {
      document.title = base;
    };
  }, [pendingCount]);

  const selected = orders.find((o) => o.id === selectedId) ?? null;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pedidos</h1>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <span
              className={cn(
                "size-2 rounded-full",
                live === "on" ? "bg-emerald-500" : live === "off" ? "bg-red-500" : "bg-amber-400",
              )}
            />
            {live === "on" ? "Recebendo pedidos ao vivo" : live === "off" ? "Conexão perdida, tentando de novo" : "Conectando"}
          </p>
        </div>
        <Button
          variant={soundOn ? "outline" : "default"}
          onClick={() => {
            unlock();
            const next = !soundOn;
            setSoundOn(next);
          }}
        >
          {soundOn ? <Bell /> : <BellOff />}
          {soundOn ? "Som ligado" : "Ativar som de novo pedido"}
        </Button>
      </div>

      <div className="flex gap-2 overflow-x-auto lg:hidden">
        {COLUMNS.map((c) => {
          const count = orders.filter((o) => c.statuses.includes(o.status)).length;
          return (
            <button
              key={c.key}
              onClick={() => setTab(c.key)}
              className={cn(
                "shrink-0 cursor-pointer rounded-full border px-3.5 py-1.5 text-sm font-medium",
                tab === c.key ? "border-brand bg-brand text-brand-foreground" : "border-border bg-card",
              )}
            >
              {c.title} {count ? `(${count})` : ""}
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        {COLUMNS.map((column) => {
          const list = orders
            .filter((o) => column.statuses.includes(o.status))
            .sort((a, b) =>
              column.key === "fim"
                ? b.created_at.localeCompare(a.created_at)
                : a.created_at.localeCompare(b.created_at),
            );
          return (
            <section
              key={column.key}
              className={cn("grid content-start gap-3", tab !== column.key && "hidden lg:grid")}
            >
              <h2 className="hidden items-center justify-between text-sm font-semibold lg:flex">
                {column.title}
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{list.length}</span>
              </h2>
              {list.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                  {column.key === "novos" ? "Nenhum pedido novo." : "Nada por aqui."}
                </p>
              ) : null}
              {list.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  now={now}
                  couriers={couriers}
                  onOpen={() => setSelectedId(order.id)}
                  onChange={upsert}
                />
              ))}
            </section>
          );
        })}
      </div>

      {selected ? (
        <OrderDialog order={selected} couriers={couriers} onClose={() => setSelectedId(null)} onChange={upsert} />
      ) : null}
    </div>
  );
}

/** Quem leva o pedido. Só para entrega ainda em andamento. */
function CourierSelect({
  order,
  couriers,
  onChange,
  compact,
}: {
  order: Order;
  couriers: CourierOption[];
  onChange: (o: Order) => void;
  compact?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const options = couriers.filter((c) => c.active || c.id === order.courier_id);
  if (order.fulfillment !== "delivery" || !options.length) return null;
  const locked = order.status === "delivered" || order.status === "cancelled";
  if (locked) {
    const name = couriers.find((c) => c.id === order.courier_id)?.name;
    return name ? (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Bike className="size-3.5" /> {name}
        {order.courier_fee_cents !== null ? ` · taxa ${formatBRL(order.courier_fee_cents)}` : ""}
      </p>
    ) : null;
  }
  return (
    <div className="grid gap-1">
      <label className={cn("flex items-center gap-2", compact ? "text-xs" : "text-sm font-medium")}>
        <Bike className={cn(compact ? "size-3.5" : "size-4", "shrink-0 text-muted-foreground")} />
        {compact ? <span className="sr-only">Motoboy</span> : "Motoboy"}
        <select
          aria-label={`Motoboy do pedido ${order.number}`}
          value={order.courier_id ?? ""}
          disabled={pending}
          onChange={(e) =>
            startTransition(async () => {
              setError(null);
              const r = await assignCourier(order.id, e.target.value || null);
              if (r.ok) onChange(r.order);
              else setError(r.message);
            })
          }
          className={cn(
            "min-w-0 flex-1 cursor-pointer rounded-lg border bg-card px-2",
            compact ? "h-8 text-xs" : "h-10 text-sm",
            order.courier_id ? "border-border" : "border-dashed border-brand/60 text-brand",
          )}
        >
          <option value="">{order.courier_id ? "Tirar motoboy" : "Escolher motoboy"}</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

function OrderCard({
  order,
  now,
  couriers,
  onOpen,
  onChange,
}: {
  order: Order;
  now: number;
  couriers: CourierOption[];
  onOpen: () => void;
  onChange: (o: Order) => void;
}) {
  const [pending, startTransition] = useTransition();
  const next = nextStatus(order.status, order.fulfillment);
  const label = nextStatusAction(order.status, order.fulfillment);
  const isNew = order.status === "pending";

  return (
    <article
      className={cn(
        "grid gap-3 rounded-2xl border bg-card p-4 shadow-xs",
        isNew ? "border-brand ring-2 ring-brand/20" : "border-border",
        order.status === "cancelled" && "opacity-60",
      )}
    >
      <button onClick={onOpen} className="grid cursor-pointer gap-1 text-left">
        <div className="flex items-center justify-between gap-2">
          <span className="text-lg font-bold">#{order.number}</span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="size-3.5" /> {minutesAgo(order.created_at, now)}
          </span>
        </div>
        <p className="truncate font-medium">{order.customer_name}</p>
        <ScheduledBadge order={order} />
        <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
          {order.fulfillment === "delivery" ? <Bike className="size-3.5" /> : <StoreIcon className="size-3.5" />}
          {order.fulfillment === "delivery" ? order.address_district : "Retirada"}
        </p>
        <div className="mt-1 flex items-center justify-between text-sm">
          <span className={cn("rounded-md px-1.5 py-0.5 text-xs font-medium", paymentBadge(order).tone)}>
            {paymentBadge(order).text}
          </span>
          <span className="font-semibold">{formatBRL(order.total_cents)}</span>
        </div>
        {order.status === "out_for_delivery" || order.status === "ready" || order.status === "cancelled" ? (
          <span className="text-xs font-medium text-muted-foreground">
            {order.status === "ready" && order.fulfillment === "pickup" ? "Aguardando retirada" : STATUS_LABELS[order.status]}
          </span>
        ) : null}
      </button>
      {order.status !== "pending" ? <CourierSelect order={order} couriers={couriers} onChange={onChange} compact /> : null}
      {next && label ? (
        <Button
          size="sm"
          variant={isNew ? "default" : "outline"}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await updateOrderStatus({ orderId: order.id, status: next });
              if (result.ok) onChange(result.order as Order);
            })
          }
        >
          {pending ? "..." : label}
        </Button>
      ) : null}
    </article>
  );
}

/** Pix pelo WhatsApp: o lojista confere o comprovante e marca o pedido como pago. */
function WhatsappPixControl({ order, onChange }: { order: Order; onChange: (o: Order) => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const paid = order.payment_status === "paid";
  const toggle = () =>
    startTransition(async () => {
      setError(null);
      const result = await setWhatsappPixPaid({ orderId: order.id, paid: !paid });
      if (result.ok) onChange(result.order as Order);
      else setError(result.message);
    });

  return (
    <section
      className={cn(
        "grid gap-2 rounded-xl p-4 text-sm",
        paid ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900",
      )}
    >
      {paid ? (
        <p className="flex items-center gap-2 font-semibold">
          <CheckCircle2 className="size-4" /> Pix confirmado. Não cobrar na entrega.
        </p>
      ) : (
        <p>
          <strong>Pix a confirmar.</strong> O cliente pediu a chave Pix pelo WhatsApp. Confira o comprovante e marque como
          pago.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {paid ? (
          <Button size="sm" variant="ghost" disabled={pending} onClick={toggle}>
            {pending ? "..." : "Desfazer: ainda não pago"}
          </Button>
        ) : (
          <Button size="sm" disabled={pending} onClick={toggle}>
            <CheckCircle2 /> {pending ? "..." : "Marcar Pix como pago"}
          </Button>
        )}
      </div>
      {error ? <p className="text-red-700">{error}</p> : null}
    </section>
  );
}

function OrderDialog({
  order,
  couriers,
  onClose,
  onChange,
}: {
  order: Order;
  couriers: CourierOption[];
  onClose: () => void;
  onChange: (o: Order) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const next = nextStatus(order.status, order.fulfillment);
  const label = nextStatusAction(order.status, order.fulfillment);
  const phone = order.customer_phone.replace(/\D/g, "");

  const change = (status: OrderStatus, cancelReason?: string) =>
    startTransition(async () => {
      const result = await updateOrderStatus({ orderId: order.id, status, reason: cancelReason });
      if (result.ok) {
        onChange(result.order as Order);
        setCancelling(false);
      }
    });

  return (
    <Dialog open onClose={onClose} label={`Pedido ${order.number}`}>
      <div className="grid gap-5 overflow-y-auto p-5">
        <div className="pr-10">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{STATUS_LABELS[order.status]}</p>
          <h2 className="text-2xl font-bold">Pedido #{order.number}</h2>
          <p className="text-sm text-muted-foreground">
            {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(
              new Date(order.created_at),
            )}
          </p>
          {order.scheduled_for ? (
            <div className="mt-2">
              <ScheduledBadge order={order} large />
            </div>
          ) : null}
        </div>

        <section className="grid gap-1 rounded-xl bg-muted/60 p-4 text-sm">
          <p className="font-semibold">{order.customer_name}</p>
          <a
            href={`https://wa.me/55${phone.replace(/^55/, "")}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-brand hover:underline"
          >
            <MessageCircle className="size-4" /> {formatPhoneBR(phone)}
          </a>
          <p>{orderAddress(order)}</p>
          {order.address_reference ? <p className="text-muted-foreground">Ref.: {order.address_reference}</p> : null}
          {order.notes ? <p className="mt-1 font-medium">Obs.: {order.notes}</p> : null}
        </section>

        <CourierSelect order={order} couriers={couriers} onChange={onChange} />

        <section className="text-sm">
          <OrderItemsList order={order} />
        </section>
        <section className="border-t border-border pt-3 text-sm">
          <OrderTotals order={order} />
        </section>

        {order.payment_method === "pix_whatsapp" && order.status !== "cancelled" ? (
          <WhatsappPixControl order={order} onChange={onChange} />
        ) : null}

        {order.status === "cancelled" && order.cancel_reason ? (
          <p className="text-sm text-red-700">Motivo do cancelamento: {order.cancel_reason}</p>
        ) : null}

        {cancelling ? (
          <div className="grid gap-2 rounded-xl bg-red-50 p-4">
            {order.payment_status === "paid" ? (
              <p className="text-sm text-red-800">
                Este pedido já foi pago com Pix. Depois de cancelar, devolva o valor pelo app da sua conta de recebimento.
              </p>
            ) : null}
            <label className="text-sm font-medium text-red-800" htmlFor="reason">
              Motivo do cancelamento (opcional)
            </label>
            <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: cliente desistiu" />
            <div className="flex gap-2">
              <Button variant="destructive" size="sm" disabled={pending} onClick={() => change("cancelled", reason)}>
                Confirmar cancelamento
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setCancelling(false)}>
                Voltar
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border p-4">
        <a
          href={`/imprimir/pedido/${order.id}`}
          target="_blank"
          className="inline-flex h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold hover:bg-muted"
        >
          <Printer className="size-4" /> Imprimir
        </a>
        {order.status !== "cancelled" && order.status !== "delivered" && !cancelling ? (
          <Button variant="ghost" className="text-red-600" onClick={() => setCancelling(true)}>
            <X /> Cancelar
          </Button>
        ) : null}
        {next && label ? (
          <Button className="ml-auto" disabled={pending} onClick={() => change(next)}>
            {pending ? "..." : label}
          </Button>
        ) : null}
      </div>
    </Dialog>
  );
}
