import Link from "next/link";
import { ChevronRight, Download, Zap } from "lucide-react";
import { DailyChart, MethodBars, type MethodRow } from "@/components/painel/financeiro/finance-charts";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fillDays, formatDay, PERIODS, resolvePeriod, type FinanceReport } from "@/lib/finance";
import { PROVIDER_LABELS } from "@/lib/payments/types";
import { PAYMENT_LABELS } from "@/lib/pricing";
import { requireMyStore } from "@/lib/stores";
import { createClient } from "@/lib/supabase/server";
import { cn, formatBRL } from "@/lib/utils";

export const metadata = { title: "Financeiro" };

const METHOD_ORDER = ["pix_online", "pix_whatsapp", "pix_delivery", "card_delivery", "cash"] as const;
const METHOD_LABELS: Record<(typeof METHOD_ORDER)[number], string> = {
  pix_online: "Pix online",
  pix_whatsapp: "Pix pelo WhatsApp",
  pix_delivery: "Pix na entrega",
  card_delivery: "Cartão na entrega",
  cash: "Dinheiro",
};

export default async function FinanceiroPage({ searchParams }: PageProps<"/painel/financeiro">) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const period = resolvePeriod({ periodo: one(sp.periodo), de: one(sp.de), ate: one(sp.ate) });
  const { store } = await requireMyStore();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("finance_report", {
    p_store_id: store.id,
    p_from: period.from,
    p_to: period.to,
  });
  const report = data as FinanceReport | null;

  const sameDay = period.from === period.to;
  const periodLabel = sameDay
    ? formatDay(period.from, true)
    : `${formatDay(period.from, true)} a ${formatDay(period.to, true)}`;
  const exportHref = `/painel/financeiro/exportar?de=${period.from}&ate=${period.to}`;

  const methods: MethodRow[] = METHOD_ORDER.filter(
    (m) =>
      (m !== "pix_online" || store.pix_provider || report?.by_method.pix_online) &&
      (m !== "pix_whatsapp" || store.pix_whatsapp_enabled || report?.by_method.pix_whatsapp),
  ).map(
    (m) => ({
      key: m,
      label: METHOD_LABELS[m] ?? PAYMENT_LABELS[m],
      orders: report?.by_method[m]?.orders ?? 0,
      cents: report?.by_method[m]?.cents ?? 0,
    }),
  );
  const pixTotal =
    (report?.by_method.pix_online?.cents ?? 0) +
    (report?.by_method.pix_whatsapp?.cents ?? 0) +
    (report?.by_method.pix_delivery?.cents ?? 0);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Financeiro</h1>
          <p className="text-muted-foreground">
            {periodLabel} · só pedidos válidos (Pix online entra depois de pago; cancelados ficam à parte)
          </p>
        </div>
        <a href={exportHref} className={buttonVariants({ variant: "outline" })}>
          <Download /> Baixar planilha
        </a>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {PERIODS.map((p) => (
          <Link
            key={p.key}
            href={p.key === "hoje" ? "/painel/financeiro" : `/painel/financeiro?periodo=${p.key}`}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm font-medium",
              period.key === p.key ? "border-brand bg-brand text-brand-foreground" : "border-border bg-card hover:bg-muted",
            )}
          >
            {p.label}
          </Link>
        ))}
        <form className="flex flex-wrap items-center gap-2" action="/painel/financeiro">
          <Input type="date" name="de" defaultValue={period.from} aria-label="De" className="h-9 w-auto" required />
          <span className="text-sm text-muted-foreground">a</span>
          <Input type="date" name="ate" defaultValue={period.to} aria-label="Até" className="h-9 w-auto" required />
          <Button type="submit" size="sm" variant={period.key === "personalizado" ? "default" : "outline"}>
            Ver
          </Button>
        </form>
      </div>

      <Link
        href="/painel/financeiro/recebimento"
        className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-sm hover:bg-muted/60"
      >
        <span className={cn("grid size-9 place-items-center rounded-full", store.pix_provider ? "bg-emerald-100" : "bg-muted")}>
          <Zap className={cn("size-4", store.pix_provider ? "text-emerald-700" : "text-muted-foreground")} />
        </span>
        <span className="flex-1">
          <span className="block font-semibold">
            {store.pix_provider ? `Pix online ativo pelo ${PROVIDER_LABELS[store.pix_provider]}` : "Receba Pix na hora pelo site"}
          </span>
          <span className="block text-muted-foreground">
            {store.pix_provider
              ? "O cliente paga no site e o pedido só chega aqui depois de pago."
              : "Conecte sua conta do Mercado Pago ou do Asaas. Menos calote e menos troco."}
          </span>
        </span>
        <ChevronRight className="size-4 text-muted-foreground" />
      </Link>

      {error || !report ? (
        <Alert tone="error">Não foi possível carregar o relatório agora. Atualize a página.</Alert>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Faturamento" value={formatBRL(report.gross_cents)} hint="Total pago pelos clientes" big />
            <Stat label="Pedidos" value={String(report.orders)} hint={`${report.delivery_orders} entregas · ${report.pickup_orders} retiradas`} big />
            <Stat
              label="Ticket médio"
              value={report.orders ? formatBRL(Math.round(report.gross_cents / report.orders)) : "—"}
              hint="Valor médio por pedido"
              big
            />
            <Stat label="Recebido em Pix" value={formatBRL(pixTotal)} hint="Online, pelo WhatsApp e na entrega" big />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Produtos" value={formatBRL(report.subtotal_cents)} hint="Soma dos itens, sem taxa" />
            <Stat label="Taxas de entrega" value={formatBRL(report.delivery_fee_cents)} hint="Cobradas dos clientes" />
            <Stat label="Descontos de cupons" value={formatBRL(report.discount_cents)} hint="Já descontados do faturamento" />
            <Stat
              label="Cancelados"
              value={String(report.cancelled_orders)}
              hint={report.cancelled_orders ? `${formatBRL(report.cancelled_cents)} que não entraram` : "Nenhum no período"}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-5">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Por forma de pagamento</CardTitle>
                <CardDescription>Quanto entrou em cada uma. Confira o dinheiro do caixa por aqui.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5">
                <MethodBars rows={methods} total={report.gross_cents} />
                {report.cash_change_cents ? (
                  <p className="rounded-xl bg-muted/60 px-4 py-3 text-sm">
                    Troco entregue aos clientes: <strong>{formatBRL(report.cash_change_cents)}</strong>
                  </p>
                ) : null}
                {report.open_orders ? (
                  <p className="text-xs text-muted-foreground">
                    {report.open_orders} {report.open_orders === 1 ? "pedido ainda está" : "pedidos ainda estão"} em andamento e já{" "}
                    {report.open_orders === 1 ? "entrou" : "entraram"} na conta.
                  </p>
                ) : null}
              </CardContent>
            </Card>

            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle>Faturamento por dia</CardTitle>
              </CardHeader>
              <CardContent>
                {sameDay ? (
                  <p className="text-sm text-muted-foreground">
                    Escolha 7 dias, 30 dias ou o mês para ver a evolução dia a dia.
                  </p>
                ) : (
                  <DailyChart days={fillDays(report.by_day, period.from, period.to)} />
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Mais vendidos</CardTitle>
                <CardDescription>Pelo valor vendido no período.</CardDescription>
              </CardHeader>
              <CardContent>
                <SimpleTable
                  empty="Nenhum produto vendido no período."
                  head={["Produto", "Qtd.", "Vendido"]}
                  rows={report.top_products.map((p) => [p.name, String(p.quantity), formatBRL(p.cents)])}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Cupons usados</CardTitle>
                <CardDescription>Quantos pedidos cada cupom trouxe e quanto custou.</CardDescription>
              </CardHeader>
              <CardContent>
                <SimpleTable
                  empty="Nenhum cupom usado no período."
                  head={["Cupom", "Pedidos", "Desconto"]}
                  rows={report.coupons.map((c) => [c.code, String(c.orders), formatBRL(c.cents)])}
                />
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, hint, big }: { label: string; value: string; hint?: string; big?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-bold tracking-tight tabular-nums", big ? "text-2xl" : "text-lg")}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function SimpleTable({ head, rows, empty }: { head: string[]; rows: string[][]; empty: string }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
        <tr>
          {head.map((h, i) => (
            <th key={h} className={cn("pb-2 font-semibold", i > 0 && "text-right")}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {rows.map((r) => (
          <tr key={r[0]}>
            {r.map((c, i) => (
              <td key={i} className={cn("py-2", i > 0 && "text-right tabular-nums", i === 0 && "font-medium")}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
