import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Bike, Check, LayoutDashboard, ShoppingBag } from "lucide-react";
import { startDemo } from "@/app/demo/actions";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { APP_NAME } from "@/lib/brand";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Demonstração" };

const ERRORS: Record<string, string> = {
  config: "A demonstração ainda não está disponível neste endereço.",
  anonimo: "A demonstração ainda não foi ativada (falta ligar o login anônimo no Supabase).",
  loja: "Não conseguimos montar a loja de teste agora. Tente de novo em instantes.",
};

const ROLES = [
  {
    icon: LayoutDashboard,
    who: "Dono da loja",
    items: ["Pedidos chegando ao vivo, com som", "Escolher o motoboy e imprimir o comprovante", "Financeiro com duas semanas de vendas", "Promoções, cupons e cardápio por foto"],
  },
  {
    icon: ShoppingBag,
    who: "Cliente",
    items: ["Cardápio com pizza meio a meio", "Cupom BEMVINDO e entrega grátis", "Pagar com Pix (simulado)", "Acompanhar o pedido pelo link"],
  },
  {
    icon: Bike,
    who: "Motoboy",
    items: ["Entregas com mapa e WhatsApp", "O que cobrar e quanto de troco", "\"Saí para entrega\" e \"Entreguei\"", "Ganhos e acerto do dia"],
  },
];

export default async function DemoPage({ searchParams }: PageProps<"/demo">) {
  const { erro } = await searchParams;
  let hasSession = false;
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    hasSession = Boolean(data?.claims);
  }

  return (
    <main className="flex-1">
      <div className="mx-auto max-w-5xl px-6 py-10 md:py-16">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> {APP_NAME}
        </Link>

        <div className="mt-6 max-w-2xl">
          <h1 className="text-4xl font-bold tracking-tight md:text-5xl">Experimente com uma loja de verdade</h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Criamos uma pizzaria de teste só para você, com cardápio, pedidos chegando e motoboys. Tudo funciona, mas
            nada é cobrado. Os dados somem sozinhos em 24 horas.
          </p>
        </div>

        {typeof erro === "string" && ERRORS[erro] ? (
          <Alert tone="error" className="mt-6 max-w-2xl">
            {ERRORS[erro]}
          </Alert>
        ) : null}

        <form action={startDemo} className="mt-8 flex flex-wrap items-center gap-4">
          <Button size="lg" className="h-14 px-8 text-base">
            {hasSession ? "Abrir a demonstração" : "Começar a demonstração"}
          </Button>
          <span className="text-sm text-muted-foreground">Sem cadastro, sem cartão.</span>
        </form>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {ROLES.map(({ icon: Icon, who, items }) => (
            <section key={who} className="rounded-2xl border border-border bg-card p-6">
              <span className="inline-flex size-11 items-center justify-center rounded-xl bg-brand/10 text-brand">
                <Icon className="size-5" />
              </span>
              <h2 className="mt-4 text-lg font-semibold">Como {who.toLowerCase()}</h2>
              <ul className="mt-3 grid gap-2 text-sm text-muted-foreground">
                {items.map((t) => (
                  <li key={t} className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" /> {t}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <p className="mt-10 text-sm text-muted-foreground">
          Gostou?{" "}
          <Link href="/entrar?modo=cadastro" className={buttonVariants({ variant: "link", size: "sm" })}>
            Crie sua loja de verdade
          </Link>
        </p>
      </div>
    </main>
  );
}
