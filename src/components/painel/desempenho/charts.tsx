"use client";

import { useState } from "react";
import { cn, formatBRL } from "@/lib/utils";

// Mesma linguagem do financeiro: uma cor só (magnitude), texto sempre nas cores de texto.
const BAR = "#2a78d6";

export type Column = { key: string; label: string; orders: number; cents: number; title: string };

/** Colunas de pedidos (por hora ou por dia da semana), com dica ao passar o mouse e opção de tabela. */
export function OrdersColumns({ columns, highlight }: { columns: Column[]; highlight?: string | null }) {
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const max = Math.max(...columns.map((c) => c.orders), 1);
  const active = hover !== null ? columns[hover] : null;
  const labelEvery = Math.ceil(columns.length / 12);

  if (!columns.length || columns.every((c) => c.orders === 0)) {
    return <p className="text-sm text-muted-foreground">Sem pedidos no período.</p>;
  }

  return (
    <div className="grid gap-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setAsTable((v) => !v)}
          className="cursor-pointer text-sm font-semibold text-brand hover:underline"
        >
          {asTable ? "Ver gráfico" : "Ver tabela"}
        </button>
      </div>
      {asTable ? (
        <div className="max-h-80 overflow-y-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-semibold">Quando</th>
                <th className="px-3 py-2 text-right font-semibold">Pedidos</th>
                <th className="px-3 py-2 text-right font-semibold">Faturamento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {columns.map((c) => (
                <tr key={c.key}>
                  <td className="px-3 py-2">{c.title}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.orders}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatBRL(c.cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div>
          <div className="relative h-44 border-b border-border" onMouseLeave={() => setHover(null)}>
            <div className="absolute inset-0 flex items-end gap-1">
              {columns.map((c, i) => (
                <button
                  key={c.key}
                  type="button"
                  aria-label={`${c.title}: ${c.orders} pedidos, ${formatBRL(c.cents)}`}
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  className="flex h-full min-w-0 flex-1 cursor-default flex-col items-center justify-end outline-none"
                >
                  {c.orders ? (
                    <span className="mb-1 text-[11px] text-muted-foreground tabular-nums">{c.orders}</span>
                  ) : null}
                  <span
                    className="block w-full max-w-9 rounded-t-[4px] transition-opacity"
                    style={{
                      height: c.orders ? `max(${(c.orders / max) * 82}%, 3px)` : 0,
                      background: BAR,
                      opacity: hover === null ? (highlight && highlight !== c.key ? 0.55 : 1) : hover === i ? 1 : 0.45,
                    }}
                  />
                </button>
              ))}
            </div>
            {active ? (
              <div
                role="tooltip"
                className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md"
                style={{ left: `clamp(60px, ${((hover! + 0.5) / columns.length) * 100}%, calc(100% - 60px))` }}
              >
                <p className="font-semibold">{active.title}</p>
                <p className="tabular-nums">
                  {active.orders} {active.orders === 1 ? "pedido" : "pedidos"}
                </p>
                <p className="text-muted-foreground tabular-nums">{formatBRL(active.cents)}</p>
              </div>
            ) : null}
          </div>
          <div className="mt-2 flex gap-1 text-xs text-muted-foreground">
            {columns.map((c, i) => (
              <span key={c.key} className={cn("min-w-0 flex-1 text-center whitespace-nowrap")}>
                {i % labelEvery === 0 ? c.label : ""}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
