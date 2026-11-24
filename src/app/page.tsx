import Link from "next/link";
import { Bike, Camera, LayoutDashboard, QrCode, ShoppingBag, Ticket } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";

const FEATURES = [
  { icon: Camera, title: "Cardápio por foto", text: "Tire uma foto do cardápio impresso e o sistema monta o site para você revisar." },
  { icon: ShoppingBag, title: "Pedido sem atrito", text: "Seu cliente escolhe, monta a pizza meio a meio e finaliza em poucos toques." },
  { icon: QrCode, title: "Pix e pagamento na entrega", text: "Pix online com confirmação automática, ou cartão, Pix e dinheiro com troco na entrega." },
  { icon: Ticket, title: "Cupons e promoções", text: "Descontos por item, por dia da semana e cupons com regras simples." },
  { icon: LayoutDashboard, title: "Painel e financeiro", text: "Pedidos ao vivo, comprovante para imprimir e o caixa separado por forma de pagamento." },
  { icon: Bike, title: "Gestão de motoboys", text: "App próprio para o entregador despachar, confirmar e ver as taxas do dia." },
];

export default function Home() {
  return (
    <main className="flex-1">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <span className="text-lg font-bold tracking-tight">
          <span className="text-brand">●</span> {APP_NAME}
        </span>
        <nav className="flex items-center gap-2">
          <Link href="/entrar" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Entrar
          </Link>
          <Link href="/entrar?modo=cadastro" className={buttonVariants({ size: "sm" })}>
            Criar minha loja
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-6 pb-16 pt-12 md:pt-20">
        <p className="mb-4 inline-flex rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">
          Para pizzarias, hamburguerias e lanchonetes
        </p>
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight md:text-6xl">
          Seu delivery próprio, bonito e fácil de usar.
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-muted-foreground">{APP_TAGLINE}, sem comissão por pedido.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/entrar?modo=cadastro" className={buttonVariants({ size: "lg" })}>
            Começar agora
          </Link>
          <Link href="/demo" className={buttonVariants({ size: "lg", variant: "outline" })}>
            Ver demonstração
          </Link>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-6 pb-24 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <div key={title} className="rounded-2xl border border-border bg-card p-6">
            <div className="mb-4 inline-flex size-10 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <Icon className="size-5" />
            </div>
            <h2 className="font-semibold">{title}</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">{text}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
