"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Bike, CalendarClock, Check, ChefHat, Store as StoreIcon, Undo2 } from "lucide-react";
import {
  brTime,
  flavorsLine,
  formatMinutes,
  formatTimer,
  kitchenStartAt,
  kitchenUrgency,
  shortName,
  type KitchenOrder,
  type KitchenTiming,
} from "@/lib/kitchen";
import { cn } from "@/lib/utils";

const LEVEL_STYLES = {
  ok: { border: "border-zinc-700", head: "bg-zinc-800/80", bar: "bg-emerald-500", timer: "text-zinc-100" },
  warn: { border: "border-amber-400", head: "bg-amber-400/15", bar: "bg-amber-400", timer: "text-amber-300" },
  late: { border: "border-red-500", head: "bg-red-600/25", bar: "bg-red-500", timer: "text-red-300" },
} as const;

function Fulfillment({ order }: { order: KitchenOrder }) {
  return order.fulfillment === "delivery" ? (
    <span className="inline-flex items-center gap-1">
      <Bike className="size-[1em]" /> Entrega
    </span>
  ) : (
    <span className="inline-flex items-center gap-1">
      <StoreIcon className="size-[1em]" /> Retirada
    </span>
  );
}

/** Cartão de um pedido na cozinha: número, tempo, itens (tocar risca) e o botão da próxima etapa. */
export function KitchenTicket({
  order,
  timing,
  now,
  busy,
  doneOverrides,
  onAdvance,
  onToggleItem,
}: {
  order: KitchenOrder;
  timing: KitchenTiming;
  now: number;
  busy: boolean;
  doneOverrides: Map<string, boolean>;
  onAdvance: (order: KitchenOrder) => void;
  onToggleItem: (order: KitchenOrder, itemId: string, done: boolean) => void;
}) {
  const isNew = order.status === "pending";
  const { level, remainingMs, progress } = kitchenUrgency(order, timing, now);
  const style = LEVEL_STYLES[level];
  const started = kitchenStartAt(order, timing);
  const isDone = (id: string, doneAt: string | null) => doneOverrides.get(id) ?? !!doneAt;
  const doneCount = order.items.filter((i) => isDone(i.id, i.done_at)).length;
  const allDone = order.items.length > 0 && doneCount === order.items.length;

  return (
    <article
      data-order={order.number}
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-2xl border-2 bg-zinc-900 shadow-lg",
        style.border,
        level === "late" && "kds-late",
        isNew && "ring-4 ring-sky-400/40",
      )}
    >
      <header className={cn("flex items-start justify-between gap-3 px-4 py-3", style.head)}>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-3xl font-black leading-none tracking-tight">#{order.number}</span>
            {isNew ? (
              <span className="rounded-md bg-sky-400 px-2 py-0.5 text-xs font-black uppercase tracking-wide text-zinc-950">
                Novo
              </span>
            ) : null}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm font-medium text-zinc-300">
            <Fulfillment order={order} />
            <span className="text-zinc-500">·</span>
            <span className="truncate">{shortName(order.customer_name)}</span>
          </p>
          {order.scheduled_for ? (
            <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-violet-500/25 px-2 py-0.5 text-xs font-bold text-violet-200">
              <CalendarClock className="size-3.5" />
              Agendado {order.fulfillment === "delivery" ? "entrega" : "retirada"} {brTime(order.scheduled_for)}
            </p>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          <p className={cn("font-mono text-3xl font-bold tabular-nums leading-none", style.timer)}>
            {now < started ? brTime(started) : formatTimer(now - started)}
          </p>
          <p
            className={cn(
              "mt-1 text-xs font-bold uppercase tracking-wide",
              level === "late" ? "text-red-300" : level === "warn" ? "text-amber-300" : "text-zinc-400",
            )}
          >
            {now < started
              ? "começar às"
              : level === "late"
                ? `atrasado ${formatMinutes(remainingMs)}`
                : `faltam ${formatMinutes(remainingMs)}`}
          </p>
        </div>
      </header>
      <div className="h-1.5 bg-zinc-800">
        <div className={cn("h-full transition-[width] duration-1000", style.bar)} style={{ width: `${progress * 100}%` }} />
      </div>

      {order.notes ? (
        <p className="mx-3 mt-3 flex gap-2 rounded-xl bg-amber-300 px-3 py-2 text-[0.95rem] font-bold leading-snug text-zinc-950">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            Obs. do pedido: <span className="font-black">{order.notes}</span>
          </span>
        </p>
      ) : null}

      <ul className="grid gap-1 p-2">
        {order.items.map((item) => {
          const done = isDone(item.id, item.done_at);
          const flavors = flavorsLine(item.flavors);
          return (
            <li key={item.id}>
              <button
                type="button"
                aria-pressed={done}
                aria-label={`${item.quantity}x ${item.product_name}${done ? " (pronto)" : ""}`}
                onClick={() => onToggleItem(order, item.id, !done)}
                className={cn(
                  "flex w-full cursor-pointer items-start gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-zinc-800 active:bg-zinc-700",
                  done && "opacity-45",
                )}
              >
                <span className="min-w-[2.6ch] text-xl font-black tabular-nums leading-tight text-sky-300">
                  {item.quantity}x
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-lg font-bold leading-tight", done && "line-through decoration-2")}>
                    {item.product_name}
                    {item.size_name ? <span className="font-semibold text-zinc-300"> ({item.size_name})</span> : null}
                  </span>
                  {flavors ? (
                    <span className={cn("mt-0.5 block font-semibold text-zinc-200", done && "line-through")}>{flavors}</span>
                  ) : null}
                  {item.options.length ? (
                    <span className={cn("mt-0.5 block text-zinc-300", done && "line-through")}>
                      {item.options.map((o) => `+ ${o}`).join("   ")}
                    </span>
                  ) : null}
                  {item.notes ? (
                    <span className="mt-1 inline-flex gap-1.5 rounded-lg bg-amber-300/15 px-2 py-0.5 font-bold text-amber-200">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {item.notes}
                    </span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border-2",
                    done ? "border-emerald-400 bg-emerald-500 text-zinc-950" : "border-zinc-600",
                  )}
                >
                  {done ? <Check className="size-4" strokeWidth={3} /> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <footer className="mt-auto grid gap-1.5 p-3 pt-1">
        {order.items.length > 1 && !isNew ? (
          <p className="text-center text-xs font-semibold text-zinc-400">
            {doneCount} de {order.items.length} itens prontos
          </p>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => onAdvance(order)}
          className={cn(
            "flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-xl text-lg font-black uppercase tracking-wide transition-colors disabled:cursor-wait disabled:opacity-60",
            isNew
              ? "bg-sky-400 text-zinc-950 hover:bg-sky-300"
              : allDone
                ? "kds-glow bg-emerald-400 text-zinc-950 hover:bg-emerald-300"
                : "bg-emerald-600 text-white hover:bg-emerald-500",
          )}
        >
          {isNew ? <ChefHat className="size-6" /> : <Check className="size-6" strokeWidth={3} />}
          {busy ? "..." : isNew ? "Aceitar e preparar" : "Pronto"}
        </button>
      </footer>
    </article>
  );
}

/** Pedido pronto (aguardando motoboy ou retirada). Voltar pede dois toques. */
export function ReadyTicket({
  order,
  now,
  busy,
  onUndo,
}: {
  order: KitchenOrder;
  now: number;
  busy: boolean;
  onUndo: (order: KitchenOrder) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const id = window.setTimeout(() => setConfirming(false), 3500);
    return () => window.clearTimeout(id);
  }, [confirming]);
  const readyFor = order.ready_at ? now - Date.parse(order.ready_at) : 0;

  return (
    <article
      data-order={order.number}
      className="grid gap-2 rounded-2xl border-2 border-emerald-500/60 bg-emerald-500/10 p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-2xl font-black leading-none">#{order.number}</p>
          <p className="mt-1 flex flex-wrap gap-x-2 text-sm font-medium text-zinc-300">
            <Fulfillment order={order} />
            <span className="truncate">{shortName(order.customer_name)}</span>
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-400 px-2 py-0.5 text-xs font-black uppercase text-zinc-950">
          <Check className="size-3.5" strokeWidth={3} /> Pronto
        </span>
      </div>
      <p className="text-xs text-zinc-400">
        {order.fulfillment === "delivery" ? "Esperando motoboy" : "Esperando o cliente"} · há {formatMinutes(readyFor)}
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => (confirming ? (setConfirming(false), onUndo(order)) : setConfirming(true))}
        className={cn(
          "flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-sm font-bold transition-colors disabled:opacity-60",
          confirming ? "bg-amber-400 text-zinc-950" : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700",
        )}
      >
        <Undo2 className="size-4" />
        {busy ? "..." : confirming ? "Toque de novo para voltar" : "Voltar para o preparo"}
      </button>
    </article>
  );
}
