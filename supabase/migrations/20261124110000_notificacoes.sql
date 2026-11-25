-- Fase 12: notificações no celular/computador (Web Push).
-- Cada aparelho que ativa as notificações vira uma linha aqui:
--   store    -> painel da loja (pedido novo)
--   courier  -> app do motoboy (entrega atribuída a ele)
--   customer -> cliente (mudança de status de um pedido)
-- Só o servidor (chave secreta) lê e escreve: a tabela não tem regras para o navegador.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  audience text not null check (audience in ('store', 'courier', 'customer')),
  user_id uuid references auth.users (id) on delete cascade,
  courier_id uuid references public.couriers (id) on delete cascade,
  order_id uuid references public.orders (id) on delete cascade,
  endpoint text not null check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  created_at timestamptz not null default now(),
  check ((audience = 'store') = (user_id is not null)),
  check ((audience = 'courier') = (courier_id is not null)),
  check ((audience = 'customer') = (order_id is not null))
);
-- o mesmo aparelho pode seguir vários pedidos, mas não o mesmo alvo duas vezes
create unique index push_subscriptions_target_idx on public.push_subscriptions
  (endpoint, audience, coalesce(user_id, courier_id, order_id));
create index push_subscriptions_store_idx on public.push_subscriptions (store_id, audience);
create index push_subscriptions_order_idx on public.push_subscriptions (order_id) where order_id is not null;
create index push_subscriptions_courier_idx on public.push_subscriptions (courier_id) where courier_id is not null;
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
