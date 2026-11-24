import Link from "next/link";
import { CalendarClock, Clock, Flame, UserPlus } from "lucide-react";
import { OrdersColumns } from "@/components/painel/desempenho/charts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDay, PERIODS, resolvePeriod } from "@/lib/finance";
import { WEEKDAYS } from "@/lib/hours";
import { activeHours, formatDuration, peakWindow, percent, type PerformanceReport } from "@/lib/performance";
import { requireMyStore } from "@/lib/stores";
import { createClient } from "@/lib/supabase/server";
import { cn, formatBRL } from "@/lib/utils";

export const metadata = { title: "Desempenho" };

export default async function DesempenhoPage({ searchParams }: PageProps<"/painel/desempenho">) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  // Desempenho faz mais sentido olhando um mês: é o padrão.
  const period = resolvePeriod({ periodo: one(sp.periodo) ?? (one(sp.de) ? undefined : "30d"), de: one(sp.de), ate: one(sp.ate) });
  const { store } = await requireMyStore();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("performance_report", {
    p_store_id: store.id,
    p_from: period.from,
    p_to: period.to,
  });
  const r = data as PerformanceReport | null;

  const periodLabel =
    period.from === period.to
      ? formatDay(period.from, true)
      : `${formatDay(period.from, true)} a ${formatDay(period.to, true)}`;
  const hours = r ? activeHours(r.by_hour) : [];
  const peak = r ? peakWindow(r.by_hour) : null;
  const bestDay = r?.by_weekday.reduce((a, b) => (b.orders > a.orders ? b : a), r.by_weekday[0]);
  const total = r ? r.orders + r.cancelled_orders : 0;
  const returning = r ? r.customers - r.new_customers : 0;

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Desempenho</h1>
        <p className="text-muted-foreground">{periodLabel} · horários de pico, rapidez da loja e de onde vêm os pedidos</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {PERIODS.map((p) => (
          <Link
            key={p.key}
            href={p.key === "30d" ? "/painel/desempenho" : `/painel/desempenho?periodo=${p.key}`}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm font-medium",
              period.key === p.key ? "border-brand bg-brand text-brand-foreground" : "border-border bg-card hover:bg-muted",
            )}
          >
            {p.label}
          </Link>
        ))}
        <form className="flex flex-wrap items-center gap-2" action="/painel/desempenho">
          <Input type="date" name="de" defaultValue={period.from} aria-label="De" className="h-9 w-auto" required />
          <span className="text-sm text-muted-foreground">a</span>
          <Input type="date" name="ate" defaultValue={period.to} aria-label="Até" className="h-9 w-auto" required />
          <Button type="submit" size="sm" variant={period.key === "personalizado" ? "default" : "outline"}>
            Ver
          </Button>
        </form>
      </div>

      {error || !r ? (
        <Alert tone="error">Não foi possível carregar o desempenho agora. Atualize a página.</Alert>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              icon={<Flame className="size-4" />}
              label="Horário de pico"
              value={peak?.label ?? "—"}
              hint={peak ? `${peak.orders} pedidos nessa faixa` : "Sem pedidos no período"}
            />
            <Stat
              icon={<Clock className="size-4" />}
              label="Tempo até entregar"
              value={formatDuration(r.avg_total_minutes)}
              hint="Do pedido até a entrega, em média"
            />
            <Stat
              icon={<UserPlus className="size-4" />}
              label="Clientes novos"
              value={String(r.new_customers)}
              hint={`Pediram pela 1ª vez · ${returning} já eram clientes`}
            />
            <Stat
              icon={<CalendarClock className="size-4" />}
              label="Pedidos agendados"
              value={String(r.scheduled_orders)}
              hint={r.orders ? `${percent(r.scheduled_orders, r.orders)}% dos pedidos` : "Nenhum no período"}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Pedidos" value={String(r.orders)} hint={`${formatBRL(r.gross_cents)} vendidos`} small />
            <Stat label="Tempo para aceitar" value={formatDuration(r.avg_accept_minutes)} hint="Do pedido até a loja aceitar" small />
            <Stat label="Tempo de preparo" value={formatDuration(r.avg_prep_minutes)} hint="Do aceite até ficar pronto" small />
            <Stat
              label="Cancelamentos"
              value={`${percent(r.cancelled_orders, total)}%`}
              hint={`${r.cancelled_orders} de ${total} pedidos`}
              small
              warn={percent(r.cancelled_orders, total) >= 10}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle>Pedidos por horário</CardTitle>
                <CardDescription>Quando os clientes mais pedem. Bom para escalar equipe e motoboys.</CardDescription>
              </CardHeader>
              <CardContent>
                <OrdersColumns
                  highlight={null}
                  columns={hours.map((h) => ({
                    key: String(h.hour),
                    label: `${h.hour}h`,
                    title: `${h.hour}h às ${(h.hour + 1) % 24}h`,
                    orders: h.orders,
                    cents: h.cents,
                  }))}
                />
              </CardContent>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Por dia da semana</CardTitle>
                <CardDescription>
                  {bestDay && bestDay.orders ? `Melhor dia: ${WEEKDAYS[bestDay.weekday].toLowerCase()}.` : "Somando o período todo."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <OrdersColumns
                  highlight={bestDay && bestDay.orders ? String(bestDay.weekday) : null}
                  columns={[1, 2, 3, 4, 5, 6, 0].map((d) => {
                    const w = r.by_weekday.find((x) => x.weekday === d)!;
                    return { key: String(d), label: WEEKDAYS[d].slice(0, 3), title: WEEKDAYS[d], orders: w.orders, cents: w.cents };
                  })}
                />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Bairros que mais pedem</CardTitle>
              <CardDescription>Só entregas. Ajuda a decidir taxa de entrega e onde anunciar.</CardDescription>
            </CardHeader>
            <CardContent>
              {r.top_districts.length ? (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="pb-2 font-semibold">Bairro</th>
                      <th className="pb-2 text-right font-semibold">Pedidos</th>
                      <th className="pb-2 text-right font-semibold">Vendido</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {r.top_districts.map((d) => (
                      <tr key={d.name}>
                        <td className="py-2 font-medium">{d.name}</td>
                        <td className="py-2 text-right tabular-nums">{d.orders}</td>
                        <td className="py-2 text-right tabular-nums">{formatBRL(d.cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhuma entrega no período.</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  hint,
  small,
  warn,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  small?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className={cn("mt-1 font-bold tracking-tight tabular-nums", small ? "text-lg" : "text-2xl", warn && "text-red-700")}>
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
