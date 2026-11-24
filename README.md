# Pedido Fácil (nome provisório)

Plataforma de cardápio digital e delivery para pizzarias, hamburguerias e lanchonetes.
Cada loja tem o próprio site, painel do operador e, nas próximas fases, app do motoboy.

Stack: Next.js 16 (App Router) + TypeScript, Tailwind CSS 4, Supabase (Postgres, Auth, Storage) e Vercel.

## Rodando localmente

```bash
npm install
cp .env.example .env.local   # preencha com os dados do Supabase
npm run dev
```

Primeira vez? Siga [docs/configurar-supabase.md](docs/configurar-supabase.md).

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento em http://localhost:3000 |
| `npm run build` | Build de produção |
| `npm run lint` | ESLint |
| `npm test` | Testes (Vitest) |

## Estrutura

```
src/
  app/
    page.tsx              página de apresentação da plataforma
    entrar/               login e cadastro do operador
    auth/confirmar/       link de confirmação de e-mail
    painel/               painel do operador (protegido)
      pedidos/            pedidos ao vivo, aviso sonoro, mudança de status
      cardapio/           categorias, tamanhos, adicionais e produtos
      loja/               dados, logo, horários e bairros/taxas
    imprimir/pedido/[id]  comprovante para impressora térmica 80 mm
    loja/[slug]/          site público da loja (cardápio e carrinho)
      checkout/           finalizar pedido (pagamento na entrega, troco)
      pedido/[token]/     acompanhamento do pedido pelo cliente
    demo/                 modo demonstração (fase 6)
  components/             componentes visuais (ui/) e do painel
  lib/                    Supabase, regras de horário, dinheiro, multi-loja
  proxy.ts                sessão, proteção do painel e subdomínio da loja
supabase/migrations/      esquema do banco e regras de acesso (RLS)
supabase/tests/           testes das regras do banco num Postgres local (run.sh)
```

## Multi-loja

Todas as lojas ficam no mesmo banco. Cada tabela tem `store_id` e as regras de acesso (RLS)
garantem que um operador só lê e altera os dados da própria loja. O site público lê os
dados da loja sem login.

Com `NEXT_PUBLIC_ROOT_DOMAIN=suamarca.com.br`, `pizzaria.suamarca.com.br` abre a loja
`pizzaria`. Em desenvolvimento, `pizzaria.localhost:3000` faz o mesmo.

Valores em dinheiro são guardados em centavos (`integer`).

## Pedidos

O site do cliente nunca grava pedidos direto nas tabelas. Ele chama a função `place_order`,
que recalcula todos os preços a partir do cardápio (sabores, tamanhos, adicionais, taxa do
bairro), valida pedido mínimo, horário de funcionamento e troco, e numera o pedido em
sequência por loja. O cliente acompanha pelo link secreto (`get_public_order`). A equipe da
loja só consegue mudar o status do pedido, nunca os valores.

Pizza com mais de um sabor: cada tamanho define quantos sabores aceita, e a categoria define
se o preço é o do sabor mais caro ou a média.

## Promoções e cupons

- **Promoções** (`promotions`): desconto em % ou em R$ num produto ou numa categoria inteira,
  com dias da semana, faixa de horário e período opcionais (horário de Brasília). O site mostra
  o preço antigo riscado; em pizza meio a meio, cada sabor entra com o preço da sua promoção.
- **Cupons** (`coupons`): % (com teto opcional), valor fixo ou entrega grátis; pedido mínimo,
  limite total, limite por cliente (pelo celular), só primeiro pedido e validade. Os códigos
  não são públicos: o cliente só testa um código pelo checkout (`quote_order`).
- Tudo é recalculado em `price_order`, usado tanto pela prévia do checkout quanto pelo
  `place_order`. Pedido cancelado devolve o uso do cupom.

## Cardápio por foto

`/painel/cardapio/importar`: o operador envia até 4 fotos (ou um PDF), cada uma é lida em
paralelo pelo Claude (`src/lib/menu-reader.ts`, saída estruturada validada com zod) e o
resultado aparece numa tela de revisão ao lado da foto. Itens sem preço ou difíceis de ler
ficam destacados. Só depois da revisão a função `import_menu` grava tudo de uma vez. Precisa
de `ANTHROPIC_API_KEY` (ver `docs/configurar-supabase.md`).

## Fases

1. **Fundação**: login, cadastro da loja, horários, bairros e taxas, site base.
2. **Cardápio e pedidos**: cardápio com tamanhos, sabores e adicionais; carrinho e checkout com
   pagamento na entrega; pedidos ao vivo no painel; comprovante; acompanhamento do cliente.
3. **IA e promoções**: cardápio por foto com tela de revisão; promoções programadas;
   cupons de desconto no checkout.
4. Pix online e financeiro.
5. Motoboys.
6. Modo demonstração e página de vendas.
