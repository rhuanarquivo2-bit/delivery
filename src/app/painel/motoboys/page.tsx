import Link from "next/link";
import { Bike, Pencil, Plus } from "lucide-react";
import { CourierLink, PayoutToggle } from "@/components/painel/motoboys/courier-actions";
import { ToggleActive } from "@/components/painel/toggle-active";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { describeFee, settlement } from "@/lib/couriers";
import { formatDay, resolvePeriod, todayBR } from "@/lib/finance";
import { requireMyStore } from "@/lib/stores";
import { createClient } from "@/lib/supabase/server";
import type { Courier, CourierReportRow } from "@/lib/types";
import { cn, formatBRL } from "@/lib/utils";

export const metadata = { title: "Motoboys" };

const PERIODS = [
  { key: "hoje", label: "Hoje" },
  { key: "ontem", label: "Ontem" },
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
  { key: "mes", label: "Este mês" },
];

export default async function MotoboysPage({ searchParams }: PageProps<"/painel/motoboys">) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const period = resolvePeriod({ periodo: one(sp.periodo), de: one(sp.de), ate: one(sp.ate) });
  const today = todayBR();
  const { store } = await requireMyStore();
  const supabase = await createClient();

  const [{ data: courierRows }, { data: openRows }, { data: todayRows }, { data: reportRows, error }] = await Promise.all([
    supabase.from("couriers").select("*").eq("store_id", store.id).order("active", { ascending: false }).order("name"),
    supabase
      .from("orders")
      .select("courier_id, status")
      .eq("store_id", store.id)
      .not("courier_id", "is", null)
      .in("status", ["pending", "preparing", "ready", "out_for_delivery"]),
    supabase.rpc("courier_report", { p_store_id: store.id, p_from: today, p_to: today }),
    supabase.rpc("courier_report", { p_store_id: store.id, p_from: period.from, p_to: period.to }),
  ]);
  const couriers = (courierRows as Courier[] | null) ?? [];
  const report = (reportRows as CourierReportRow[] | null) ?? [];
  const todayBy = new Map(((todayRows as CourierReportRow[] | null) ?? []).map((r) => [r.courier_id, r]));
  const openBy = new Map<string, { waiting: number; out: number }>();
  for (const o of (openRows as { courier_id: string; status: string }[] | null) ?? []) {
    const c = openBy.get(o.courier_id) ?? { waiting: 0, out: 0 };
    if (o.status === "out_for_delivery") c.out++;
    else c.waiting++;
    openBy.set(o.courier_id, c);
  }

  const totals = report.reduce(
    (t, r) => ({
      deliveries: t.deliveries + r.deliveries,
      fees: t.fees + r.fees_cents,
      daily: t.daily + r.daily_rate_cents,
      earned: t.earned + r.earned_cents,
      cash: t.cash + r.cash_cents,
      unpaid: t.unpaid + (r.paid_at ? 0 : r.earned_cents),
    }),
    { deliveries: 0, fees: 0, daily: 0, earned: 0, cash: 0, unpaid: 0 },
  );
  const periodLabel =
    period.from === period.to ? formatDay(period.from, true) : `${formatDay(period.from, true)} a ${formatDay(period.to, true)}`;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Motoboys</h1>
          <p className="text-muted-foreground">
            Cadastre a equipe, mande o link do site de cada um e faça o acerto do dia.
          </p>
        </div>
        <Link href="/painel/motoboys/novo" className={buttonVariants()}>
          <Plus /> Novo motoboy
        </Link>
      </div>

      {couriers.length === 0 ? (
        <Card>
          <CardContent className="grid justify-items-center gap-3 py-12 text-center">
            <Bike className="size-10 text-muted-foreground" />
            <p className="font-semibold">Nenhum motoboy cadastrado</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Cadastre seus motoboys para escolher quem leva cada pedido. Cada um recebe um link com as entregas, o que cobrar
              de cada cliente e quanto ganhou no dia.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {couriers.map((c) => {
            const open = openBy.get(c.id);
            const day = todayBy.get(c.id);
            return (
              <Card key={c.id} className={cn(!c.active && "opacity-60")}>
                <CardContent className="grid gap-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{c.name}</p>
                      <p className="text-sm text-muted-foreground">{describeFee(c.fee_mode, c.fee_cents, c.daily_rate_cents)}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <ToggleActive kind="courier" id={c.id} active={c.active} />
                      <Link
                        href={`/painel/motoboys/${c.id}`}
                        className={buttonVariants({ variant: "ghost", size: "icon" })}
                        aria-label={`Editar ${c.name}`}
                      >
                        <Pencil />
                      </Link>
                    </div>
                  </div>
                  <dl className="grid grid-cols-3 gap-2 rounded-xl bg-muted/60 p-3 text-center text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">Com ele agora</dt>
                      <dd className="font-semibold tabular-nums">
                        {(open?.waiting ?? 0) + (open?.out ?? 0)}
                        {open?.out ? <span className="font-normal text-muted-foreground"> ({open.out} na rua)</span> : null}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Entregas hoje</dt>
                      <dd className="font-semibold tabular-nums">{day?.deliveries ?? 0}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Ganhou hoje</dt>
                      <dd className="font-semibold tabular-nums">{formatBRL(day?.earned_cents ?? 0)}</dd>
                    </div>
                  </dl>
                  {c.active ? <CourierLink id={c.id} name={c.name} phone={c.phone} token={c.access_token} /> : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Acerto</CardTitle>
          <CardDescription>
            {periodLabel}. Só entregas concluídas. O motoboy entrega o dinheiro que recebeu dos clientes e a loja paga as taxas
            e a diária.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="flex flex-wrap items-center gap-2">
            {PERIODS.map((p) => (
              <Link
                key={p.key}
                href={p.key === "hoje" ? "/painel/motoboys" : `/painel/motoboys?periodo=${p.key}`}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-sm font-medium",
                  period.key === p.key ? "border-brand bg-brand text-brand-foreground" : "border-border bg-card hover:bg-muted",
                )}
              >
                {p.label}
              </Link>
            ))}
            <form className="flex flex-wrap items-center gap-2" action="/painel/motoboys">
              <Input type="date" name="de" defaultValue={period.from} aria-label="De" className="h-9 w-auto" required />
              <span className="text-sm text-muted-foreground">a</span>
              <Input type="date" name="ate" defaultValue={period.to} aria-label="Até" className="h-9 w-auto" required />
              <Button type="submit" size="sm" variant={period.key === "personalizado" ? "default" : "outline"}>
                Ver
              </Button>
            </form>
          </div>

          {error ? (
            <Alert tone="error">Não foi possível carregar o acerto agora. Atualize a página.</Alert>
          ) : report.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma entrega concluída por motoboy no período.</p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-4">
                <Stat label="Entregas" value={String(totals.deliveries)} />
                <Stat label="Taxas + diárias" value={formatBRL(totals.earned)} />
                <Stat label="Dinheiro com os motoboys" value={formatBRL(totals.cash)} />
                <Stat label="Falta pagar" value={formatBRL(totals.unpaid)} />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="pb-2 font-semibold">Dia</th>
                      <th className="pb-2 font-semibold">Motoboy</th>
                      <th className="pb-2 text-right font-semibold">Entregas</th>
                      <th className="pb-2 text-right font-semibold">Taxas</th>
                      <th className="pb-2 text-right font-semibold">Diária</th>
                      <th className="pb-2 text-right font-semibold">Dinheiro recebido</th>
                      <th className="pb-2 pl-4 font-semibold">Acerto</th>
                      <th className="pb-2 text-right font-semibold">Pagamento</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {report.map((r) => (
                      <tr key={`${r.courier_id}-${r.day}`}>
                        <td className="py-2.5">{formatDay(r.day)}</td>
                        <td className="py-2.5 font-medium">{r.courier_name}</td>
                        <td className="py-2.5 text-right tabular-nums">{r.deliveries}</td>
                        <td className="py-2.5 text-right tabular-nums">{formatBRL(r.fees_cents)}</td>
                        <td className="py-2.5 text-right tabular-nums">{r.daily_rate_cents ? formatBRL(r.daily_rate_cents) : "—"}</td>
                        <td className="py-2.5 text-right tabular-nums">{formatBRL(r.cash_cents)}</td>
                        <td className="py-2.5 pl-4">{settlement(r).text}</td>
                        <td className="py-2.5 text-right">
                          <PayoutToggle courierId={r.courier_id} day={r.day} paid={Boolean(r.paid_at)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold tracking-tight tabular-nums">{value}</p>
    </div>
  );
}
