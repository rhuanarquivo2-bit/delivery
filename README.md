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
      loja/               dados, logo, horários e bairros/taxas
    loja/[slug]/          site público da loja
    demo/                 modo demonstração (fase 6)
  components/             componentes visuais (ui/) e do painel
  lib/                    Supabase, regras de horário, dinheiro, multi-loja
  proxy.ts                sessão, proteção do painel e subdomínio da loja
supabase/migrations/      esquema do banco e regras de acesso (RLS)
```

## Multi-loja

Todas as lojas ficam no mesmo banco. Cada tabela tem `store_id` e as regras de acesso (RLS)
garantem que um operador só lê e altera os dados da própria loja. O site público lê os
dados da loja sem login.

Com `NEXT_PUBLIC_ROOT_DOMAIN=suamarca.com.br`, `pizzaria.suamarca.com.br` abre a loja
`pizzaria`. Em desenvolvimento, `pizzaria.localhost:3000` faz o mesmo.

Valores em dinheiro são guardados em centavos (`integer`).

## Fases

1. **Fundação** (este código): login, cadastro da loja, horários, bairros e taxas, site base.
2. Cardápio e pedidos.
3. Cardápio por foto com IA, promoções e cupons.
4. Pix online e financeiro.
5. Motoboys.
6. Modo demonstração e página de vendas.
