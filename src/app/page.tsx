import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Bike,
  Camera,
  Check,
  ClipboardList,
  MessageCircle,
  Printer,
  QrCode,
  Share2,
  ShoppingBag,
  Ticket,
  Wallet,
  X,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { APP_NAME, APP_TAGLINE, SALES_WHATSAPP } from "@/lib/brand";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: { absolute: `${APP_NAME}: delivery próprio, sem comissão` },
  description: `${APP_TAGLINE}. Cardápio por foto, Pix na hora, painel de pedidos, motoboys e financeiro.`,
};

const STEPS = [
  {
    icon: Camera,
    title: "Tire uma foto do cardápio",
    text: "A IA lê o cardápio impresso e monta categorias, tamanhos, sabores e preços. Você só revisa.",
  },
  {
    icon: Share2,
    title: "Divulgue o seu link",
    text: "Sua loja ganha um endereço próprio para colocar no Instagram, no WhatsApp e no panfleto.",
  },
  {
    icon: ClipboardList,
    title: "Receba, prepare e entregue",
    text: "O pedido toca no painel, sai o comprovante e o motoboy recebe tudo no celular.",
  },
];

const FEATURES = [
  {
    icon: ShoppingBag,
    eyebrow: "Para o seu cliente",
    title: "Pedir é rápido, até pizza meio a meio",
    text: "Cardápio bonito com fotos, tamanhos, sabores, bordas e adicionais. O cliente vê o preço certo na hora, aplica cupom e acompanha o pedido por um link, sem baixar aplicativo.",
    bullets: ["Funciona em qualquer celular", "Promoção aparece com o preço riscado", "Acompanhamento do pedido em tempo real"],
    image: { src: "/vendas/loja.png", alt: "Cardápio da loja no celular", phone: true },
  },
  {
    icon: QrCode,
    eyebrow: "Pagamento",
    title: "Pix na hora, direto na sua conta",
    text: "Conecte o Mercado Pago ou o Asaas e o cliente paga pelo QR Code ou copia e cola. O pedido só chega na cozinha depois de pago. Também aceita cartão, Pix e dinheiro com troco na entrega.",
    bullets: ["Confirmação automática do pagamento", "Sem pagar comissão para a plataforma", "Troco calculado para o motoboy"],
    image: { src: "/vendas/pix.png", alt: "Pagamento com Pix pelo celular", phone: true },
  },
  {
    icon: ClipboardList,
    eyebrow: "Painel da loja",
    title: "Pedidos ao vivo, com som e comprovante",
    text: "Novos pedidos tocam e piscam na tela. Aceite, mande para o preparo, escolha o motoboy e imprima o comprovante em qualquer impressora, até a térmica.",
    bullets: ["Funciona no computador, tablet ou celular", "Pedido pago online chega marcado", "WhatsApp do cliente a um toque"],
    image: { src: "/vendas/painel.png", alt: "Painel de pedidos da loja", phone: false },
  },
  {
    icon: Bike,
    eyebrow: "Motoboys",
    title: "Cada motoboy com o próprio site de entregas",
    text: "O motoboy vê endereço, mapa, o que cobrar e quanto levar de troco. Marca quando saiu e quando entregou. No fim do dia, a conta já está feita: entregas, taxas, diária e o dinheiro que ele recebeu.",
    bullets: ["Sem instalar nada", "Taxa fixa ou por bairro, com diária", "Acerto do dia com um clique"],
    image: { src: "/vendas/motoboy.png", alt: "Site de entregas do motoboy", phone: true },
  },
  {
    icon: Wallet,
    eyebrow: "Financeiro",
    title: "O caixa separado por forma de pagamento",
    text: "Quanto entrou em Pix, cartão e dinheiro, ticket médio, vendas por dia, produtos mais vendidos e quanto cada cupom trouxe. Exporta para planilha quando precisar.",
    bullets: ["Hoje, ontem, 7 dias, mês ou datas escolhidas", "Troco e cancelados à parte", "Planilha pronta para o contador"],
    image: { src: "/vendas/financeiro.png", alt: "Tela do financeiro", phone: false },
  },
];

const EXTRAS = [
  { icon: Ticket, title: "Promoções e cupons", text: "Desconto por produto ou categoria, por dia e horário. Cupom de primeiro pedido, entrega grátis e pedido mínimo." },
  { icon: Camera, title: "Cardápio por foto", text: "Troque de sistema sem digitar o cardápio inteiro de novo." },
  { icon: Printer, title: "Comprovante", text: "Imprime direto do navegador, no tamanho da impressora térmica." },
  { icon: MessageCircle, title: "WhatsApp", text: "Cliente e motoboy a um toque, com a mensagem pronta." },
];

const COMPARISON = [
  ["Comissão sobre cada pedido", "Cobrada em todas as vendas", "Nenhuma"],
  ["Dados e contato dos clientes", "Ficam com o aplicativo", "Ficam com você"],
  ["Sua marca e suas cores", "Você é mais um na lista", "Site com a sua cara"],
  ["Pix na sua conta", "Repasse depois de dias", "Na hora, direto na sua conta"],
  ["Promoções e cupons", "Regras do aplicativo", "Do seu jeito"],
];

const FAQ = [
  {
    q: "Preciso instalar alguma coisa?",
    a: "Não. Tudo funciona pelo navegador: o painel no computador ou tablet, o site do cliente e o site do motoboy no celular.",
  },
  {
    q: "Como eu recebo o Pix?",
    a: "Você conecta a conta da loja no Mercado Pago ou no Asaas. O dinheiro cai direto lá, e o pedido só é liberado depois que o banco confirma. A taxa do Pix é a da sua conta.",
  },
  {
    q: "E se o cliente quiser pagar na entrega?",
    a: "Tem cartão, Pix e dinheiro na entrega. Se for em dinheiro, o cliente informa o troco e o motoboy já sai sabendo quanto levar.",
  },
  {
    q: "Posso usar com o iFood ou outro aplicativo?",
    a: "Pode. Muitas lojas usam o site próprio para os clientes fiéis, que pedem direto e sem comissão, e mantêm o aplicativo para ser encontradas por clientes novos.",
  },
  {
    q: "Tenho que digitar o cardápio todo?",
    a: "Não. Tire foto do cardápio impresso (ou envie o PDF) e revise o que foi lido. Depois, mudar preço ou pausar um item leva segundos.",
  },
  {
    q: "Dá para testar antes?",
    a: "Dá. A demonstração cria uma loja de teste só sua, cheia de pedidos de exemplo, sem cadastro. Você vê o painel, faz pedidos como cliente e entrega como motoboy.",
  },
];

export default function Home() {
  const whatsapp = SALES_WHATSAPP
    ? `https://wa.me/${SALES_WHATSAPP}?text=${encodeURIComponent(`Oi! Quero saber mais sobre o ${APP_NAME}.`)}`
    : null;

  return (
    <main className="flex-1">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3.5">
          <Link href="/" className="text-lg font-bold tracking-tight">
            <span className="text-brand">●</span> {APP_NAME}
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
            <a href="#como-funciona" className="hover:text-foreground">
              Como funciona
            </a>
            <a href="#recursos" className="hover:text-foreground">
              Recursos
            </a>
            <a href="#perguntas" className="hover:text-foreground">
              Perguntas
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/entrar" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Entrar
            </Link>
            <Link href="/demo" className={buttonVariants({ size: "sm" })}>
              Testar grátis
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-20 pt-14 md:grid-cols-[1.1fr_1fr] md:pt-20">
          <div>
            <p className="mb-5 inline-flex rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">
              Para pizzarias, hamburguerias e lanchonetes
            </p>
            <h1 className="text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl">
              Seu delivery próprio. Sem comissão por pedido.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted-foreground">
              Cardápio digital bonito, Pix na hora direto na sua conta, painel de pedidos, motoboys e financeiro. Tudo
              pronto em uma tarde, a partir de uma foto do seu cardápio.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/demo" className={buttonVariants({ size: "lg" })}>
                Testar agora, sem cadastro <ArrowRight />
              </Link>
              <Link href="/entrar?modo=cadastro" className={buttonVariants({ size: "lg", variant: "outline" })}>
                Criar minha loja
              </Link>
            </div>
            <ul className="mt-8 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
              {["Sem aplicativo para instalar", "Pix com confirmação automática", "Cardápio montado por IA", "Site do motoboy incluso"].map(
                (t) => (
                  <li key={t} className="flex items-center gap-2">
                    <Check className="size-4 text-emerald-600" /> {t}
                  </li>
                ),
              )}
            </ul>
          </div>

          <div className="relative mx-auto w-full max-w-md md:max-w-none">
            <div className="absolute -inset-x-10 -top-10 bottom-0 -z-10 rounded-[3rem] bg-gradient-to-br from-brand/15 via-orange-100/60 to-transparent blur-2xl" />
            <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
              <Image src="/vendas/painel.png" alt="Painel de pedidos" width={1366} height={800} priority className="h-auto w-full" />
            </div>
            <Phone className="absolute -bottom-10 -left-4 w-36 sm:-left-10 sm:w-44" src="/vendas/loja.png" alt="Loja no celular" />
          </div>
        </div>
      </section>

      {/* Como funciona */}
      <section id="como-funciona" className="scroll-mt-16 border-y border-border bg-card">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Do cardápio de papel ao primeiro pedido</h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">Sem técnico, sem instalação e sem digitar tudo de novo.</p>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="relative rounded-2xl border border-border bg-background p-6">
                <span className="absolute right-5 top-4 text-5xl font-bold text-muted">{i + 1}</span>
                <span className="mb-4 inline-flex size-11 items-center justify-center rounded-xl bg-brand text-brand-foreground">
                  <Icon className="size-5" />
                </span>
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Recursos */}
      <section id="recursos" className="mx-auto grid max-w-6xl scroll-mt-16 gap-24 px-6 py-24">
        {FEATURES.map((f, i) => (
          <article key={f.title} className="grid items-center gap-10 md:grid-cols-2">
            <div className={cn(i % 2 === 1 && "md:order-2")}>
              <p className="flex items-center gap-2 text-sm font-semibold text-brand">
                <f.icon className="size-4" /> {f.eyebrow}
              </p>
              <h3 className="mt-2 text-2xl font-bold tracking-tight md:text-3xl">{f.title}</h3>
              <p className="mt-3 text-muted-foreground">{f.text}</p>
              <ul className="mt-5 grid gap-2 text-sm">
                {f.bullets.map((b) => (
                  <li key={b} className="flex items-center gap-2">
                    <Check className="size-4 text-emerald-600" /> {b}
                  </li>
                ))}
              </ul>
            </div>
            <div className={cn("flex justify-center", i % 2 === 1 && "md:order-1")}>
              {f.image.phone ? (
                <Phone className="w-64" src={f.image.src} alt={f.image.alt} />
              ) : (
                <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
                  <Image src={f.image.src} alt={f.image.alt} width={1366} height={800} className="h-auto w-full" />
                </div>
              )}
            </div>
          </article>
        ))}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {EXTRAS.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-2xl border border-border bg-card p-5">
              <Icon className="size-5 text-brand" />
              <h3 className="mt-3 font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Comparação */}
      <section className="bg-stone-900 text-white">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Aplicativo de marketplace ou site próprio?</h2>
          <p className="mt-3 max-w-2xl text-stone-300">
            O marketplace ajuda a ser encontrado. O site próprio é onde o cliente que já te conhece pede de novo, e o lucro
            fica com você.
          </p>
          <div className="mt-10 overflow-x-auto rounded-2xl border border-stone-700">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-stone-800 text-left">
                <tr>
                  <th className="px-5 py-3 font-semibold" />
                  <th className="px-5 py-3 font-semibold text-stone-300">Aplicativo de marketplace</th>
                  <th className="px-5 py-3 font-semibold">{APP_NAME}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-800">
                {COMPARISON.map(([label, them, us]) => (
                  <tr key={label}>
                    <td className="px-5 py-3.5 font-medium">{label}</td>
                    <td className="px-5 py-3.5 text-stone-400">
                      <span className="flex items-center gap-2">
                        <X className="size-4 shrink-0 text-stone-500" /> {them}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="flex items-center gap-2">
                        <Check className="size-4 shrink-0 text-emerald-400" /> {us}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Demonstração */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="grid items-center gap-10 rounded-3xl border border-border bg-card p-8 md:grid-cols-[1.3fr_1fr] md:p-12">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Teste tudo agora, sem cadastro</h2>
            <p className="mt-3 text-muted-foreground">
              Em um clique você ganha uma loja de teste com cardápio, pedidos chegando e duas semanas de vendas. Faça um
              pedido como cliente, aceite no painel e entregue como motoboy.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/demo" className={buttonVariants({ size: "lg" })}>
                Abrir a demonstração <ArrowRight />
              </Link>
              {whatsapp ? (
                <a href={whatsapp} target="_blank" rel="noreferrer" className={buttonVariants({ size: "lg", variant: "outline" })}>
                  <MessageCircle /> Falar no WhatsApp
                </a>
              ) : null}
            </div>
          </div>
          <ul className="grid gap-3 text-sm">
            {[
              ["Dono da loja", "Painel, financeiro, promoções e motoboys"],
              ["Cliente", "Cardápio, cupom e Pix pelo celular"],
              ["Motoboy", "Entregas, troco e ganhos do dia"],
            ].map(([who, what]) => (
              <li key={who} className="flex items-center gap-3 rounded-xl bg-muted/60 px-4 py-3">
                <Check className="size-4 text-emerald-600" />
                <span>
                  <span className="font-semibold">{who}:</span> {what}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Perguntas */}
      <section id="perguntas" className="scroll-mt-16 border-t border-border bg-card">
        <div className="mx-auto max-w-3xl px-6 py-20">
          <h2 className="text-3xl font-bold tracking-tight">Perguntas frequentes</h2>
          <div className="mt-8 divide-y divide-border rounded-2xl border border-border bg-background">
            {FAQ.map(({ q, a }) => (
              <details key={q} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                  {q}
                  <span className="text-xl leading-none text-muted-foreground transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-2 text-sm text-muted-foreground">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20 text-center">
        <h2 className="mx-auto max-w-2xl text-3xl font-bold tracking-tight md:text-4xl">
          Seu próximo pedido pode chegar sem comissão.
        </h2>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/entrar?modo=cadastro" className={buttonVariants({ size: "lg" })}>
            Criar minha loja
          </Link>
          <Link href="/demo" className={buttonVariants({ size: "lg", variant: "outline" })}>
            Ver a demonstração
          </Link>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-sm text-muted-foreground">
          <span>
            <span className="text-brand">●</span> {APP_NAME}
          </span>
          <span>{APP_TAGLINE}</span>
        </div>
      </footer>
    </main>
  );
}

/** Moldura de celular para as capturas de tela. */
function Phone({ src, alt, className }: { src: string; alt: string; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-[2.2rem] border-[7px] border-stone-900 bg-stone-900 shadow-2xl", className)}>
      <Image src={src} alt={alt} width={780} height={1688} className="h-auto w-full rounded-[1.6rem]" />
    </div>
  );
}
