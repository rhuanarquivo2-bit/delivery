import Link from "next/link";
import { Pencil, Plus, Ticket } from "lucide-react";
import { ToggleActive } from "@/components/painel/toggle-active";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { couponLabel } from "@/lib/pricing";
import { requireMyStore } from "@/lib/stores";
import { createClient } from "@/lib/supabase/server";
import type { Coupon } from "@/lib/types";
import { cn, formatBRL } from "@/lib/utils";

export const metadata = { title: "Cupons" };

const dateBR = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }).format(
    new Date(new Date(iso).getTime() - 1),
  );

function status(c: Coupon, uses: number) {
  const now = Date.now();
  if (!c.active) return { label: "Pausado", tone: "bg-stone-100 text-stone-600" };
  if (c.ends_at && new Date(c.ends_at).getTime() <= now) return { label: "Vencido", tone: "bg-stone-100 text-stone-600" };
  if (c.usage_limit && uses >= c.usage_limit) return { label: "Esgotado", tone: "bg-stone-100 text-stone-600" };
  if (c.starts_at && new Date(c.starts_at).getTime() > now) return { label: "Agendado", tone: "bg-amber-50 text-amber-700" };
  return { label: "Valendo", tone: "bg-emerald-50 text-emerald-700" };
}

function rules(c: Coupon) {
  const r: string[] = [];
  if (c.min_order_cents) r.push(`pedido a partir de ${formatBRL(c.min_order_cents)}`);
  if (c.kind === "percent" && c.max_discount_cents) r.push(`até ${formatBRL(c.max_discount_cents)}`);
  if (c.first_order_only) r.push("só primeiro pedido");
  if (c.per_customer_limit) r.push(`${c.per_customer_limit}x por cliente`);
  if (c.ends_at) r.push(`até ${dateBR(c.ends_at)}`);
  return r.join(" · ");
}

export default async function CuponsPage() {
  const { store } = await requireMyStore();
  const supabase = await createClient();
  const [{ data: couponRows }, { data: usedRows }] = await Promise.all([
    supabase.from("coupons").select("*").eq("store_id", store.id).order("created_at", { ascending: false }),
    supabase
      .from("orders")
      .select("coupon_id, discount_cents")
      .eq("store_id", store.id)
      .not("coupon_id", "is", null)
      .neq("status", "cancelled"),
  ]);
  const coupons = (couponRows as Coupon[] | null) ?? [];
  const usage = new Map<string, { uses: number; discount: number }>();
  for (const row of (usedRows as { coupon_id: string; discount_cents: number }[] | null) ?? []) {
    const u = usage.get(row.coupon_id) ?? { uses: 0, discount: 0 };
    usage.set(row.coupon_id, { uses: u.uses + 1, discount: u.discount + row.discount_cents });
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cupons</h1>
          <p className="text-muted-foreground">Códigos de desconto para divulgar no Instagram, WhatsApp ou na embalagem.</p>
        </div>
        <Link href="/painel/cupons/novo" className={buttonVariants()}>
          <Plus /> Novo cupom
        </Link>
      </div>

      {coupons.length === 0 ? (
        <Card className="px-6 py-14 text-center">
          <Ticket className="mx-auto size-10 text-brand" />
          <h2 className="mt-3 text-lg font-semibold">Nenhum cupom ainda</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Crie, por exemplo, BEMVINDO com 10% no primeiro pedido, ou FRETEGRATIS para pedidos acima de R$ 60,00.
          </p>
          <Link href="/painel/cupons/novo" className={cn(buttonVariants(), "mt-6")}>
            <Plus /> Criar cupom
          </Link>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border">
            {coupons.map((c) => {
              const u = usage.get(c.id) ?? { uses: 0, discount: 0 };
              const s = status(c, u.uses);
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="rounded-lg border border-dashed border-brand/50 bg-brand/5 px-2 py-0.5 font-mono text-sm font-bold text-brand">
                        {c.code}
                      </span>
                      <span className="font-semibold">{couponLabel(c, formatBRL)}</span>
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", s.tone)}>{s.label}</span>
                    </p>
                    {rules(c) ? <p className="mt-1 text-xs text-muted-foreground">{rules(c)}</p> : null}
                    <p className="mt-1 text-xs text-muted-foreground">
                      Usado {u.uses}
                      {c.usage_limit ? ` de ${c.usage_limit}` : ""} {u.uses === 1 ? "vez" : "vezes"}
                      {u.discount ? ` · ${formatBRL(u.discount)} em descontos` : ""}
                    </p>
                  </div>
                  <ToggleActive kind="coupon" id={c.id} active={c.active} />
                  <Link href={`/painel/cupons/${c.id}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                    <Pencil /> Editar
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
