import Link from "next/link";
import { CheckCircle2, Circle, ExternalLink } from "lucide-react";
import { CreateStoreForm } from "@/components/painel/loja/create-store-form";
import { OpenToggle } from "@/components/painel/open-toggle";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isOpenNow } from "@/lib/hours";
import { getMyStore, getStoreSettings } from "@/lib/stores";
import { rootDomainLabel, storeUrl } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { cn, formatBRL } from "@/lib/utils";

/** Meia-noite de hoje no horário de Brasília, em ISO. */
function startOfTodayISO() {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  return new Date(`${day}T00:00:00-03:00`).toISOString();
}

export default async function PainelHome() {
  const mine = await getMyStore();

  if (!mine) {
    return (
      <div className="mx-auto max-w-lg">
        <h1 className="text-2xl font-bold tracking-tight">Vamos criar sua loja</h1>
        <p className="mt-1 text-muted-foreground">Só o básico agora. Você completa o resto quando quiser.</p>
        <Card className="mt-6">
          <CardContent>
            <CreateStoreForm rootDomain={rootDomainLabel} />
          </CardContent>
        </Card>
      </div>
    );
  }

  const { store } = mine;
  const supabase = await createClient();
  const [{ hours, zones }, { count: productCount }, { data: todayOrders }] = await Promise.all([
    getStoreSettings(store.id),
    supabase.from("products").select("id", { count: "exact", head: true }).eq("store_id", store.id),
    supabase
      .from("orders")
      .select("status, total_cents")
      .eq("store_id", store.id)
      .gte("created_at", startOfTodayISO()),
  ]);
  const valid = (todayOrders ?? []).filter((o) => o.status !== "cancelled");
  const revenue = valid.reduce((n, o) => n + o.total_cents, 0);
  const waiting = valid.filter((o) => o.status === "pending").length;
  const open = isOpenNow(hours, store.open_override);

  const steps = [
    { done: true, label: "Criar a loja", href: "/painel/loja" },
    { done: (productCount ?? 0) > 0, label: "Montar o cardápio", href: "/painel/cardapio" },
    { done: Boolean(store.logo_url), label: "Enviar o logo", href: "/painel/loja#logo" },
    { done: hours.length > 0, label: "Definir o horário de funcionamento", href: "/painel/loja#horarios" },
    { done: zones.length > 0, label: "Cadastrar bairros e taxas de entrega", href: "/painel/loja#bairros" },
    { done: Boolean(store.address_street), label: "Preencher o endereço", href: "/painel/loja" },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Olá!</h1>
          <p className="text-muted-foreground">Este é o painel da {store.name}.</p>
        </div>
        <Link href={storeUrl(store.slug)} target="_blank" className={buttonVariants({ variant: "outline" })}>
          Ver meu site <ExternalLink />
        </Link>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className={cn("size-3 rounded-full", open ? "bg-emerald-500" : "bg-red-500")} />
            <div>
              <p className="font-semibold">{open ? "Loja aberta" : "Loja fechada"}</p>
              <p className="text-sm text-muted-foreground">
                {store.open_override === null ? "Seguindo o horário de funcionamento." : "Definido manualmente."}
              </p>
            </div>
          </div>
          <OpenToggle override={store.open_override} />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Link href="/painel/pedidos" className="rounded-2xl border border-border bg-card p-5 hover:border-brand/40">
          <p className="text-sm text-muted-foreground">Pedidos hoje</p>
          <p className="mt-1 text-2xl font-bold">{valid.length}</p>
        </Link>
        <Link href="/painel/pedidos" className="rounded-2xl border border-border bg-card p-5 hover:border-brand/40">
          <p className="text-sm text-muted-foreground">Vendido hoje</p>
          <p className="mt-1 text-2xl font-bold">{formatBRL(revenue)}</p>
        </Link>
        <Link
          href="/painel/pedidos"
          className={cn(
            "rounded-2xl border bg-card p-5",
            waiting ? "border-brand ring-2 ring-brand/20" : "border-border hover:border-brand/40",
          )}
        >
          <p className="text-sm text-muted-foreground">Aguardando aceite</p>
          <p className={cn("mt-1 text-2xl font-bold", waiting && "text-brand")}>{waiting}</p>
        </Link>
      </div>

      {doneCount < steps.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Deixe sua loja pronta</CardTitle>
            <CardDescription>
              {doneCount} de {steps.length} passos concluídos.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-1">
            {steps.map((s) => (
              <Link
                key={s.label}
                href={s.href}
                className="flex items-center gap-3 rounded-xl px-2 py-2 text-sm hover:bg-muted"
              >
                {s.done ? (
                  <CheckCircle2 className="size-5 text-emerald-600" />
                ) : (
                  <Circle className="size-5 text-muted-foreground" />
                )}
                <span className={cn(s.done && "text-muted-foreground line-through")}>{s.label}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <p className="text-sm text-muted-foreground">Cupons, financeiro e motoboys chegam nas próximas fases.</p>
    </div>
  );
}
