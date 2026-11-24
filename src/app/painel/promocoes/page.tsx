import Link from "next/link";
import { BadgePercent, Pencil, Plus } from "lucide-react";
import { ToggleActive } from "@/components/painel/toggle-active";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getMenu, getPromotions } from "@/lib/menu";
import { describeSchedule, isPromotionLive, localMoment } from "@/lib/promotions";
import { requireMyStore } from "@/lib/stores";
import type { Promotion } from "@/lib/types";
import { cn, formatBRL } from "@/lib/utils";

export const metadata = { title: "Promoções" };

function status(p: Promotion, today: string) {
  if (!p.active) return { label: "Pausada", tone: "bg-stone-100 text-stone-600" };
  if (p.ends_on && p.ends_on < today) return { label: "Encerrada", tone: "bg-stone-100 text-stone-600" };
  if (isPromotionLive(p)) return { label: "Valendo agora", tone: "bg-emerald-50 text-emerald-700" };
  return { label: "Agendada", tone: "bg-amber-50 text-amber-700" };
}

export default async function PromocoesPage() {
  const { store } = await requireMyStore();
  const [promotions, menu] = await Promise.all([getPromotions(store.id), getMenu(store.id)]);
  const today = localMoment().date;

  const targetName = (p: Promotion) => {
    if (p.category_id) {
      const c = menu.find((x) => x.id === p.category_id);
      return c ? `Toda a categoria ${c.name}` : "Categoria removida";
    }
    for (const c of menu) {
      const product = c.products.find((x) => x.id === p.product_id);
      if (product) return `${product.name} (${c.name})`;
    }
    return "Produto removido";
  };

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Promoções</h1>
          <p className="text-muted-foreground">
            Descontos que entram e saem sozinhos, por dia da semana, horário ou período.
          </p>
        </div>
        {menu.length ? (
          <Link href="/painel/promocoes/nova" className={buttonVariants()}>
            <Plus /> Nova promoção
          </Link>
        ) : null}
      </div>

      {promotions.length === 0 ? (
        <Card className="px-6 py-14 text-center">
          <BadgePercent className="mx-auto size-10 text-brand" />
          <h2 className="mt-3 text-lg font-semibold">Nenhuma promoção ainda</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {menu.length
              ? "Crie, por exemplo, 20% de desconto nos hambúrgueres toda terça, ou R$ 10 off na pizza grande no fim de semana. O site mostra o preço antigo riscado."
              : "Monte o cardápio primeiro. Depois volte aqui para criar descontos."}
          </p>
          <Link
            href={menu.length ? "/painel/promocoes/nova" : "/painel/cardapio"}
            className={cn(buttonVariants(), "mt-6")}
          >
            {menu.length ? (
              <>
                <Plus /> Criar promoção
              </>
            ) : (
              "Ir para o cardápio"
            )}
          </Link>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border">
            {promotions.map((p) => {
              const s = status(p, today);
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-5">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-sm font-bold text-brand">
                    {p.kind === "percent" ? `-${p.value}%` : <BadgePercent className="size-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      {p.name}
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", s.tone)}>{s.label}</span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {p.kind === "percent" ? `${p.value}% off` : `${formatBRL(p.value)} off`} em {targetName(p)}
                    </p>
                    <p className="text-xs text-muted-foreground">{describeSchedule(p)}</p>
                  </div>
                  <ToggleActive kind="promotion" id={p.id} active={p.active} />
                  <Link href={`/painel/promocoes/${p.id}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
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
