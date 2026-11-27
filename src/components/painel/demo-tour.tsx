import Link from "next/link";
import { ArrowRight, Bike, Camera, ChefHat, ClipboardList, ShoppingBag, Wallet, Ticket } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Roteiro sugerido para quem está testando o sistema. */
export function DemoTour({ storeHref }: { storeHref: string }) {
  const steps = [
    {
      icon: ShoppingBag,
      title: "Faça um pedido como cliente",
      text: "Monte uma pizza meio a meio, use o cupom BEMVINDO e pague com Pix (simulado).",
      href: storeHref,
      external: true,
    },
    {
      icon: ClipboardList,
      title: "Receba o pedido no painel",
      text: "Ative o som, aceite o pedido, escolha o motoboy e imprima o comprovante.",
      href: "/painel/pedidos",
    },
    {
      icon: ChefHat,
      title: "Abra a tela da cozinha (KDS)",
      text: "Pedidos com cronômetro e alerta de atraso. Toque nos itens para riscar e marque como pronto.",
      href: "/cozinha",
    },
    {
      icon: Bike,
      title: "Entregue como motoboy",
      text: "Abra o site do motoboy (botão no topo): o que cobrar, mapa, \"Saí\" e \"Entreguei\".",
      href: "/painel/motoboys",
    },
    {
      icon: Wallet,
      title: "Veja o financeiro",
      text: "Duas semanas de vendas de exemplo: Pix, cartão, dinheiro, vendas por dia e planilha.",
      href: "/painel/financeiro?periodo=30d",
    },
    {
      icon: Ticket,
      title: "Crie uma promoção ou cupom",
      text: "Desconto por dia da semana e horário, ou cupom com pedido mínimo.",
      href: "/painel/promocoes",
    },
    {
      icon: Camera,
      title: "Monte um cardápio por foto",
      text: "Tire foto de um cardápio impresso e revise o que a IA leu.",
      href: "/painel/cardapio/importar",
    },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Roteiro da demonstração</CardTitle>
        <CardDescription>
          Esta é uma loja de verdade, só que de teste: tudo funciona. Sugestão do que experimentar:
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2">
        {steps.map(({ icon: Icon, title, text, href, external }, i) => (
          <Link
            key={title}
            href={href}
            target={external ? "_blank" : undefined}
            className="group flex gap-3 rounded-xl border border-border p-4 hover:border-brand/40 hover:bg-muted/40"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand/10 text-sm font-bold text-brand">
              {i + 1}
            </span>
            <span className="grid gap-0.5">
              <span className="flex items-center gap-1.5 font-semibold">
                <Icon className="size-4 text-muted-foreground" /> {title}
                <ArrowRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
              </span>
              <span className="text-sm text-muted-foreground">{text}</span>
            </span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
