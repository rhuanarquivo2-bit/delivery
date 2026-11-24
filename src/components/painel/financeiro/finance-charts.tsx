"use client";

import { useState } from "react";
import { formatDay } from "@/lib/finance";
import { cn, formatBRL } from "@/lib/utils";

// Uma cor só (magnitude). Texto sempre nas cores de texto, nunca na cor da barra.
const BAR = "#2a78d6";

function niceMax(value: number) {
  if (value <= 0) return 100;
  const pow = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * pow >= value)! * pow;
  return step;
}

const compactBRL = (cents: number) =>
  cents >= 100000
    ? `R$ ${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(cents / 100000)} mil`
    : formatBRL(cents).replace(/,00$/, "");

// ---------------------------------------------------------------------------
export type MethodRow = { key: string; label: string; orders: number; cents: number };

/** Barras horizontais por forma de pagamento, com valor e % escritos ao lado. */
export function MethodBars({ rows, total }: { rows: MethodRow[]; total: number }) {
  const max = Math.max(...rows.map((r) => r.cents), 1);
  return (
    <ul className="grid gap-4">
      {rows.map((r) => {
        const pct = total ? Math.round((r.cents / total) * 100) : 0;
        return (
          <li key={r.key} className="grid gap-1.5" title={`${r.label}: ${formatBRL(r.cents)} em ${r.orders} pedidos`}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium">{r.label}</span>
              <span>
                <span className="font-semibold tabular-nums">{formatBRL(r.cents)}</span>
                <span className="ml-2 text-muted-foreground tabular-nums">
                  {pct}% · {r.orders} {r.orders === 1 ? "pedido" : "pedidos"}
                </span>
              </span>
            </div>
            <div className="h-3 rounded-full bg-muted">
              <div
                className="h-3 rounded-full"
                style={{ width: r.cents ? `max(${(r.cents / max) * 100}%, 6px)` : 0, background: BAR }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
type Day = { day: string; orders: number; cents: number };

/** Faturamento por dia: colunas com dica ao passar o mouse e opção de ver em tabela. */
export function DailyChart({ days }: { days: Day[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const max = niceMax(Math.max(...days.map((d) => d.cents), 0));
  const ticks = [max, max / 2, 0];
  const labelEvery = Math.ceil(days.length / 8);
  const best = days.reduce((a, b) => (b.cents > a.cents ? b : a), days[0]);
  const active = hover !== null ? days[hover] : null;

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3 text-sm">
        <p className="text-muted-foreground">
          {best && best.cents > 0 ? (
            <>
              Melhor dia: <strong className="text-foreground">{formatDay(best.day)}</strong> com{" "}
              <strong className="text-foreground">{formatBRL(best.cents)}</strong>
            </>
          ) : (
            "Sem vendas no período."
          )}
        </p>
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
                <th className="px-3 py-2 font-semibold">Dia</th>
                <th className="px-3 py-2 text-right font-semibold">Pedidos</th>
                <th className="px-3 py-2 text-right font-semibold">Faturamento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {days.map((d) => (
                <tr key={d.day}>
                  <td className="px-3 py-2">{formatDay(d.day, true)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{d.orders}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatBRL(d.cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-[auto_1fr] gap-x-3">
          {/* eixo Y */}
          <div className="relative h-48 text-right text-xs text-muted-foreground tabular-nums">
            {ticks.map((t, i) => (
              <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${(i / (ticks.length - 1)) * 100}%` }}>
                {compactBRL(t)}
              </span>
            ))}
            <span className="invisible">{compactBRL(max)}</span>
          </div>

          <div className="relative h-48" onMouseLeave={() => setHover(null)}>
            {ticks.map((t, i) => (
              <div
                key={t}
                className={cn("absolute inset-x-0 border-t", i === ticks.length - 1 ? "border-border" : "border-border/50 border-dashed")}
                style={{ top: `${(i / (ticks.length - 1)) * 100}%` }}
              />
            ))}
            <div className="absolute inset-0 flex items-end gap-[2px]">
              {days.map((d, i) => (
                <button
                  key={d.day}
                  type="button"
                  aria-label={`${formatDay(d.day, true)}: ${formatBRL(d.cents)}, ${d.orders} pedidos`}
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  className="flex h-full min-w-0 flex-1 cursor-default items-end justify-center outline-none"
                >
                  <span
                    className="block w-full max-w-6 rounded-t-[4px] transition-opacity"
                    style={{
                      height: d.cents ? `max(${(d.cents / max) * 100}%, 3px)` : 0,
                      background: BAR,
                      opacity: hover === null || hover === i ? 1 : 0.45,
                    }}
                  />
                </button>
              ))}
            </div>
            {active ? (
              <div
                role="tooltip"
                className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md"
                style={{ left: `clamp(60px, ${((hover! + 0.5) / days.length) * 100}%, calc(100% - 60px))` }}
              >
                <p className="font-semibold">{formatDay(active.day, true)}</p>
                <p className="tabular-nums">{formatBRL(active.cents)}</p>
                <p className="text-muted-foreground">
                  {active.orders} {active.orders === 1 ? "pedido" : "pedidos"}
                </p>
              </div>
            ) : null}
          </div>

          {/* eixo X */}
          <div />
          <div className="mt-2 flex gap-[2px] text-xs text-muted-foreground">
            {days.map((d, i) => (
              <span key={d.day} className="min-w-0 flex-1 overflow-visible text-center whitespace-nowrap">
                {i % labelEvery === 0 ? formatDay(d.day) : ""}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
