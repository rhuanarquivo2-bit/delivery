# Fomely

Plataforma de cardápio digital e delivery para pizzarias, hamburguerias e lanchonetes.
Cada loja tem o próprio site, painel do operador e site do motoboy.

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
      clientes/           clientes, filtros e planilha
      desempenho/         horários de pico, tempos e bairros
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

## Pix online e financeiro

- Cada loja conecta a própria conta do **Mercado Pago** (Access Token) ou do **Asaas** (chave
  de API) em `/painel/financeiro/recebimento`. O dinheiro cai direto na conta da loja.
  As chaves ficam em `store_payment_accounts`, que só o servidor lê (`SUPABASE_SECRET_KEY`).
- Pedido com "Pagar agora com Pix" nasce como `awaiting` e não aparece no painel. A cobrança é
  criada em `src/lib/payments/` e o cliente vê o QR Code e o copia e cola. O pagamento é
  confirmado sempre consultando a API do provedor (aviso em `/api/pagamentos/<provedor>`, botão
  "Já paguei" e conferência a cada 5 s); só então `mark_order_paid` libera o pedido.
- Pix não pago em 30 minutos: a cobrança é cancelada e o pedido também (`expire_order_payment`).
- O Asaas exige CPF: o checkout pede quando a loja usa Asaas.
- `/painel/financeiro`: faturamento, ticket médio, totais por forma de pagamento (Pix online,
  Pix/cartão/dinheiro na entrega), troco, vendas por dia, mais vendidos, cupons e planilha CSV.
  Os números vêm de `finance_report`, calculado no banco no horário de Brasília.

## Motoboys

- `/painel/motoboys`: cadastro (nome, celular, chave Pix), quanto ganha (valor fixo por
  entrega ou a taxa do bairro, mais diária opcional) e acerto por dia: entregas, taxas, diária,
  dinheiro recebido dos clientes, quem deve quanto a quem e "marcar pago".
- No painel de pedidos, cada entrega tem um seletor de motoboy (`assign_courier`). A taxa fica
  gravada no pedido na hora em que ele é passado ao motoboy.
- Site do motoboy em `/entregador/<link>` (sem login, link secreto por motoboy, que a loja pode
  trocar a qualquer momento): entregas com endereço, mapa, WhatsApp do cliente, o que cobrar
  (dinheiro com troco, cartão, Pix ou já pago), botões "Saí para entrega" e "Entreguei",
  ganhos do dia e dos últimos 7 dias. Tudo passa por `courier_portal` e `courier_update`.

## Demonstração e página de vendas

- `/` é a página de vendas: o que o sistema faz, telas reais, comparação com marketplace,
  preço, perguntas frequentes e os botões "Testar agora, sem cadastro" e "Criar minha loja".
  As imagens ficam em `public/vendas/`. O preço (`PLAN_PRICE`) e o WhatsApp de vendas ficam em
  `src/lib/brand.ts` (o WhatsApp também pode vir de `NEXT_PUBLIC_SALES_WHATSAPP`).
- `/demo` cria, sem cadastro, uma loja de exemplo só para o visitante ("Pizzaria Bella Massa"):
  cardápio, promoções, cupons, dois motoboys, 13 dias de pedidos e 3 pedidos em andamento.
  Usa o login anônimo do Supabase e a função `create_demo_store`. A mesma sessão volta para a
  mesma loja.
- No painel da demonstração aparece uma barra com "Simular pedido", "Ver como cliente",
  "Ver como motoboy" e "Criar minha loja", e um roteiro de 6 passos na tela inicial.
- O Pix da demonstração é falso (QR Code de mentira e botão "Simular pagamento"). A loja de
  demonstração não conecta conta de recebimento e lê no máximo 3 fotos de cardápio.
- Lojas de demonstração somem depois de 24 horas (`purge_demo_stores`, chamada a cada nova
  demonstração).

## Agendamento, clientes, desempenho e marketing

- **Pedido agendado** (`Minha loja > Site e pedidos`): o cliente escolhe dia e horário (de 15 em 15
  minutos, dentro do horário de funcionamento, depois do tempo de preparo e até N dias à frente).
  Com a loja fechada, o site continua recebendo agendamentos. `place_order` confere tudo de novo
  (`scheduled_for`); o painel e o comprovante mostram "Agendado: amanhã às 20:00".
- **CEP no checkout**: busca no ViaCEP pelo navegador do cliente, preenche a rua e escolhe o bairro de
  entrega da loja com o mesmo nome (`src/lib/cep.ts`). Opcional; o CEP vai para o comprovante.
- **Janela de promoções**: ao abrir o site, mostra os produtos com promoção valendo agora (uma vez por
  visita), se a loja ligar a opção.
- **Via da cozinha**: `/imprimir/pedido/<id>?via=caixa|cozinha|ambas`. A via da cozinha não tem preços
  e tem letra maior; a loja escolhe se o padrão é imprimir as duas. A via do caixa leva o logo.
- **Clientes** (`/painel/clientes`): um por celular, com pedidos, total gasto, último pedido, filtros
  (fiéis, novos, sumidos), WhatsApp com mensagem pronta e planilha. Vem de `customer_report`.
- **Desempenho** (`/painel/desempenho`): horário de pico, pedidos por hora e por dia da semana,
  tempos (aceitar, preparo, até a entrega), clientes novos, agendados, cancelamentos e bairros.
  Vem de `performance_report`.
- **Facebook Pixel e Google Analytics**: a loja cola o ID; o site registra PageView, AddToCart,
  InitiateCheckout e Purchase (`src/components/loja/store-tracking.tsx`). O formato dos IDs é
  conferido no banco, então nunca vira código.

## Fases

1. **Fundação**: login, cadastro da loja, horários, bairros e taxas, site base.
2. **Cardápio e pedidos**: cardápio com tamanhos, sabores e adicionais; carrinho e checkout com
   pagamento na entrega; pedidos ao vivo no painel; comprovante; acompanhamento do cliente.
3. **IA e promoções**: cardápio por foto com tela de revisão; promoções programadas;
   cupons de desconto no checkout.
4. **Pix online e financeiro**: Pix na hora pelo Mercado Pago ou Asaas; pedido só chega
   depois de pago; tela Financeiro com totais por forma de pagamento e planilha.
5. **Motoboys**: cadastro, escolha do motoboy por pedido, site do motoboy com entregas e
   ganhos do dia, acerto diário com marcação de pago.
6. **Demonstração e página de vendas**: loja de exemplo sem cadastro com pedidos, Pix
   simulado e motoboys; página de vendas com telas reais.
7. **Melhorias**: pedido agendado, CEP no checkout, janela de promoções, via da cozinha,
   clientes, desempenho, Facebook Pixel e Google Analytics.
