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
2. `NEXT_PUBLIC_SITE_URL`: o endereço do site com https (ex.: `https://pedidofacil.com.br`).
   É para onde o Mercado Pago e o Asaas mandam o aviso de pagamento.

Sem a chave secreta, o checkout só oferece pagamento na entrega. Em desenvolvimento
(`http://localhost`) não há aviso automático: a página do pedido confere o pagamento sozinha
a cada 5 segundos, então dá para testar com a conta de testes do Mercado Pago (`TEST-...`)
ou com o sandbox do Asaas (`$aact_hmlg_...`).
