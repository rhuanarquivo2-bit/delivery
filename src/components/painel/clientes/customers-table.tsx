"use client";

import { useMemo, useState } from "react";
import { MessageCircle, Search } from "lucide-react";
import { formatPhoneBR } from "@/components/painel/pedidos/order-details";
import {
  AWAY_DAYS,
  daysSince,
  LOYAL_ORDERS,
  matchesFilter,
  searchCustomers,
  whatsappLink,
  type CustomerFilter,
  type CustomerRow,
} from "@/lib/customers";
import { cn, formatBRL } from "@/lib/utils";

const FILTERS: { key: CustomerFilter; label: string; hint: string }[] = [
  { key: "todos", label: "Todos", hint: "" },
  { key: "fieis", label: "Fiéis", hint: `${LOYAL_ORDERS} pedidos ou mais` },
  { key: "novos", label: "Novos", hint: `Primeiro pedido nos últimos ${AWAY_DAYS} dias` },
  { key: "sumidos", label: "Sumidos", hint: `Sem pedir há ${AWAY_DAYS} dias ou mais` },
];

type Sort = "recentes" | "pedidos" | "gasto";

const PAGE = 50;

function lastOrderLabel(iso: string) {
  const d = daysSince(iso);
  if (d <= 0) return "hoje";
  if (d === 1) return "ontem";
  if (d < 60) return `há ${d} dias`;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(iso));
}

export function CustomersTable({ rows, storeName }: { rows: CustomerRow[]; storeName: string }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CustomerFilter>("todos");
  const [sort, setSort] = useState<Sort>("recentes");
  const [limit, setLimit] = useState(PAGE);

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.key, rows.filter((r) => matchesFilter(r, f.key)).length])),
    [rows],
  );
  const list = useMemo(() => {
    const filtered = searchCustomers(rows, query).filter((r) => matchesFilter(r, filter));
    const sorted = [...filtered];
    if (sort === "pedidos") sorted.sort((a, b) => b.orders - a.orders || b.total_cents - a.total_cents);
    if (sort === "gasto") sorted.sort((a, b) => b.total_cents - a.total_cents);
    return sorted;
  }, [rows, query, filter, sort]);

  if (!rows.length) {
    return (
      <p className="rounded-2xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
        Ainda não há clientes. Assim que chegarem pedidos pelo seu site, eles aparecem aqui.
      </p>
    );
  }

  const message = (c: CustomerRow) =>
    filter === "sumidos"
      ? `Oi, ${c.name.split(" ")[0]}! Faz tempo que você não pede na ${storeName}. Bateu a fome? 😋`
      : `Oi, ${c.name.split(" ")[0]}! Aqui é da ${storeName}.`;

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            title={f.hint || undefined}
            onClick={() => {
              setFilter(f.key);
              setLimit(PAGE);
            }}
            className={cn(
              "cursor-pointer rounded-full border px-3.5 py-1.5 text-sm font-medium",
              filter === f.key ? "border-brand bg-brand text-brand-foreground" : "border-border bg-card hover:bg-muted",
            )}
          >
            {f.label} <span className="opacity-70">({counts[f.key]})</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm focus-within:border-brand sm:max-w-sm">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE);
            }}
            placeholder="Buscar por nome, celular ou bairro"
            aria-label="Buscar cliente"
            className="w-full min-w-0 bg-transparent outline-none"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Ordenar
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="h-10 cursor-pointer rounded-xl border border-border bg-card px-3 text-sm text-foreground"
          >
            <option value="recentes">Pedido mais recente</option>
            <option value="pedidos">Mais pedidos</option>
            <option value="gasto">Mais gastou</option>
          </select>
        </label>
      </div>
      {filter !== "todos" ? <p className="-mt-2 text-xs text-muted-foreground">{FILTERS.find((f) => f.key === filter)!.hint}</p> : null}

      {list.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nenhum cliente encontrado.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="hidden bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground sm:table-header-group">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Cliente</th>
                <th className="px-4 py-2.5 text-right font-semibold">Pedidos</th>
                <th className="px-4 py-2.5 text-right font-semibold">Gastou</th>
                <th className="px-4 py-2.5 font-semibold">Último pedido</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.slice(0, limit).map((c) => (
                <tr key={c.phone} className="grid grid-cols-[1fr_auto] gap-x-3 px-4 py-3 sm:table-row sm:p-0">
                  <td className="min-w-0 sm:px-4 sm:py-3">
                    <p className="truncate font-semibold">
                      {c.name}
                      {c.orders >= LOYAL_ORDERS ? (
                        <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                          fiel
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatPhoneBR(c.phone)}
                      {c.district ? ` · ${c.district}` : ""}
                    </p>
                  </td>
                  <td className="row-span-2 self-center sm:hidden">
                    <a
                      href={whatsappLink(c.phone, message(c))}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`WhatsApp de ${c.name}`}
                      className="grid size-10 place-items-center rounded-xl border border-border text-emerald-700 hover:bg-muted"
                    >
                      <MessageCircle className="size-4" />
                    </a>
                  </td>
                  <td className="text-xs text-muted-foreground sm:px-4 sm:py-3 sm:text-right sm:text-sm sm:text-foreground sm:tabular-nums">
                    <span className="sm:hidden">
                      {c.orders} {c.orders === 1 ? "pedido" : "pedidos"} · {formatBRL(c.total_cents)} · último {lastOrderLabel(c.last_order_at)}
                      {c.cancelled ? ` · ${c.cancelled} cancelado${c.cancelled > 1 ? "s" : ""}` : ""}
                    </span>
                    <span className="hidden sm:inline">{c.orders}</span>
                  </td>
                  <td className="hidden px-4 py-3 text-right tabular-nums sm:table-cell">{formatBRL(c.total_cents)}</td>
                  <td className="hidden px-4 py-3 sm:table-cell">
                    <span className={cn(daysSince(c.last_order_at) >= AWAY_DAYS && "text-amber-700")}>
                      {lastOrderLabel(c.last_order_at)}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 text-right sm:table-cell">
                    <a
                      href={whatsappLink(c.phone, message(c))}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-muted"
                    >
                      <MessageCircle className="size-3.5" /> WhatsApp
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {list.length > limit ? (
        <button
          onClick={() => setLimit((n) => n + PAGE)}
          className="mx-auto cursor-pointer rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Mostrar mais ({list.length - limit})
        </button>
      ) : null}
    </section>
  );
}
