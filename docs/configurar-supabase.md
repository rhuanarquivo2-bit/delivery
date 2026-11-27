# Configurar o Supabase

Leva uns 10 minutos e o plano gratuito é suficiente para começar.

1. Crie uma conta em https://supabase.com e clique em **New project**.
   - Região: **South America (São Paulo)**.
   - Guarde a senha do banco num lugar seguro.
2. Abra **SQL Editor > New query** e rode, **um de cada vez e nesta ordem**, o conteúdo de cada
   arquivo da pasta `supabase/migrations/`:
   1. `20261124000000_fundacao.sql` (lojas, horários, bairros, imagens)
   2. `20261124010000_cardapio_pedidos.sql` (cardápio e pedidos; também liga os pedidos ao vivo)
   3. `20261124020000_promocoes_cupons.sql` (promoções, cupons e importação do cardápio por foto)
   4. `20261124030000_pix_financeiro.sql` (Pix online, contas de recebimento e relatório financeiro)
   5. `20261124040000_motoboys.sql` (motoboys, entregas, site do motoboy e acerto)
   6. `20261124050000_demonstracao.sql` (modo demonstração)
   7. `20261124060000_melhorias.sql` (pedido agendado, CEP, clientes, desempenho, via da cozinha, Pixel e Analytics)
   8. Os seguintes, em ordem, até `20261124150000_seguranca.sql` (reforço de segurança: dados de clientes, limite de pedidos e de leituras por foto)
   9. `20261124160000_cozinha.sql` (tela da cozinha: tempo alvo, itens prontos e link da cozinha sem login)

   Isso cria as tabelas, as regras de acesso e o espaço para as imagens.
3. Em **Authentication > URL Configuration**:
   - **Site URL**: o endereço do site (em desenvolvimento, `http://localhost:3000`).
   - **Redirect URLs**: adicione `http://localhost:3000/auth/confirmar` e, depois do deploy,
     `https://SEU-DOMINIO/auth/confirmar`.
4. Em **Project Settings > API**, copie a **Project URL** e a **Publishable key**
   para o arquivo `.env.local` (use o `.env.example` como modelo).
5. Rode `npm run dev` e acesse http://localhost:3000/entrar?modo=cadastro.

Para testar sem confirmar e-mail, desligue **Authentication > Sign In / Providers > Email > Confirm email**.
Ligue de novo antes de colocar no ar.

## Leitura do cardápio por foto (opcional)

1. Crie uma conta em https://console.anthropic.com e adicione crédito em **Billing**
   (cada leitura de foto custa poucos centavos de dólar).
2. Em **API Keys**, clique em **Create Key** e copie a chave.
3. Coloque em `ANTHROPIC_API_KEY` no `.env.local` e, no deploy, em
   **Vercel > Project > Settings > Environment Variables**. Não compartilhe a chave com ninguém.

Sem a chave, a tela "Importar por foto" avisa que a leitura ainda não está ativa.

## Pix online (opcional)

O Pix online usa a conta de cada loja no Mercado Pago ou no Asaas (o dono conecta em
**Painel > Financeiro > Receber Pix online**). Para isso o servidor precisa de duas variáveis:

1. `SUPABASE_SECRET_KEY`: em **Project Settings > API Keys**, copie uma **Secret key**
   (`sb_secret_...`). Ela guarda e lê as chaves de recebimento das lojas e confirma os
   pagamentos. Só no servidor: nunca use `NEXT_PUBLIC_` nem mostre para ninguém.
2. `NEXT_PUBLIC_SITE_URL`: o endereço do site com https (ex.: `https://SEU-DOMINIO.com.br`).
   É para onde o Mercado Pago e o Asaas mandam o aviso de pagamento.

Sem a chave secreta, o checkout só oferece pagamento na entrega. Em desenvolvimento
(`http://localhost`) não há aviso automático: a página do pedido confere o pagamento sozinha
a cada 5 segundos, então dá para testar com a conta de testes do Mercado Pago (`TEST-...`)
ou com o sandbox do Asaas (`$aact_hmlg_...`).

## Notificações no celular (opcional)

O painel recebe aviso de pedido novo, o motoboy recebe aviso de entrega passada para ele e o
cliente recebe aviso a cada mudança do pedido. Cada um liga no próprio aparelho, no botão
**Ativar**. O servidor precisa de:

1. `SUPABASE_SECRET_KEY` (a mesma do Pix online).
2. `NEXT_PUBLIC_VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY`: gere o par uma vez com
   `npx web-push generate-vapid-keys`. Não troque depois: quem já ativou teria de ativar de novo.
3. Opcional: `VAPID_SUBJECT` (ex.: `mailto:contato@SEU-DOMINIO.com.br`).

No Android e no computador funciona direto no navegador. No iPhone (iOS 16.4 ou mais novo)
só funciona com o site adicionado à tela de início (Compartilhar > Adicionar à Tela de Início);
o botão explica isso para quem abrir pelo Safari.

## Administração da plataforma (prazo e bloqueio das lojas)

Depois de rodar `20261124120000_acesso_lojas.sql`, diga quem é o administrador (troque o e-mail):

```sql
insert into public.platform_admins (user_id)
select id from auth.users where email = 'seu-email@exemplo.com';
```

Entre no painel com esse e-mail e abra `/admin` (ou o link **Administração** no menu).
Lá aparecem todas as lojas (menos as de demonstração): dá para somar dias, escolher a data de
validade, liberar sem prazo, bloquear/desbloquear, anotar, separar lojas em teste grátis e
pagantes (dar prazo marca como pagante) e apagar a loja (digitando o endereço dela para confirmar). Loja nova ganha os dias de teste
configurados (padrão 7). Loja vencida ou bloqueada não recebe pedidos e o lojista vê o aviso.

## Modo demonstração

A demonstração (`/demo`) cria uma loja de exemplo sem pedir cadastro. Para funcionar:

1. Em **Authentication > Sign In / Providers**, ligue **Allow anonymous sign-ins**.
2. Recomendado: em **Authentication > Attack Protection**, ligue o **captcha**, para que robôs
   não criem demonstrações em massa.
3. O Pix simulado da demonstração usa a mesma `SUPABASE_SECRET_KEY` do Pix online.
   Sem ela, a demonstração funciona com pagamento na entrega.

As lojas de demonstração são apagadas sozinhas depois de 24 horas. Os visitantes anônimos
continuam na lista de usuários; para limpar os antigos, ative a extensão **pg_cron**
(**Database > Extensions**) e rode uma vez no SQL Editor:

```sql
select cron.schedule('limpar-visitantes', '0 4 * * *',
  $$delete from auth.users where is_anonymous and created_at < now() - interval '30 days'$$);
```

## Segurança (recomendado antes de colocar no ar)

No painel do Supabase:

1. **Authentication > Attack Protection**: ligue **Prevent use of leaked passwords**
   (recusa senhas que já vazaram na internet) e o **captcha**.
2. **Authentication > Sign In / Providers > Email**: deixe **Confirm email** ligado e a senha
   mínima em 8 caracteres.
3. **Authentication > Rate Limits**: confira os limites de login e cadastro (os padrões já ajudam).
4. **Advisors > Security Advisor**: rode e veja se aparece algum aviso vermelho.
5. Nunca coloque a `SUPABASE_SECRET_KEY` em variável que comece com `NEXT_PUBLIC_`.

Nas contas do Supabase, da Vercel, do GitHub, do Asaas e do Mercado Pago: ligue a
**verificação em duas etapas** (código no celular).
