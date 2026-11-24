import { Download } from "lucide-react";
import { CustomersTable } from "@/components/painel/clientes/customers-table";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { LOYAL_ORDERS, summarizeCustomers, type CustomerRow } from "@/lib/customers";
import { requireMyStore } from "@/lib/stores";
import { createClient } from "@/lib/supabase/server";
import { cn, formatBRL } from "@/lib/utils";

export const metadata = { title: "Clientes" };

export default async function ClientesPage() {
  const { store } = await requireMyStore();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("customer_report", { p_store_id: store.id });
  const rows = ((data ?? []) as CustomerRow[]).map((r) => ({ ...r, total_cents: Number(r.total_cents) }));
  const s = summarizeCustomers(rows);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground">
            Todo mundo que já pediu no seu site, pelo celular. Chame quem sumiu e cuide de quem volta sempre.
          </p>
        </div>
        <a href="/painel/clientes/exportar" className={buttonVariants({ variant: "outline" })}>
          <Download /> Baixar planilha
        </a>
      </div>

      {error ? (
        <Alert tone="error">Não foi possível carregar os clientes agora. Atualize a página.</Alert>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Clientes" value={String(s.customers)} hint={`${s.newOnes} novos nos últimos 30 dias`} />
            <Stat
              label="Voltaram a pedir"
              value={s.customers ? `${Math.round((s.returning / s.customers) * 100)}%` : "—"}
              hint={`${s.returning} com 2 pedidos ou mais`}
            />
            <Stat label="Fiéis" value={String(s.loyal)} hint={`${LOYAL_ORDERS} pedidos ou mais`} />
            <Stat label="Gasto médio por cliente" value={s.customers ? formatBRL(s.avgSpentCents) : "—"} hint="Somando todos os pedidos" />
          </div>
          <CustomersTable rows={rows} storeName={store.name} />
        </>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold tracking-tight tabular-nums")}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
