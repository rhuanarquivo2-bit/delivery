-- Fase 17: tela da cozinha (KDS).
-- Pode rodar mais de uma vez sem problema (tudo é "se não existir" / "substitui").
--
-- 1. Tempo alvo da cozinha por loja: depois dele o pedido fica vermelho na tela ("atrasado").
-- 2. Itens prontos: a cozinha toca no item para riscar, e ele fica riscado em todas as telas.
-- 3. Link da cozinha: o tablet/TV da cozinha abre a tela sem login, por um link secreto que a
--    loja troca ou desliga quando quiser. Com o link só dá para ver os pedidos da cozinha
--    (sem preços, telefone ou endereço), aceitar, marcar pronto e voltar para o preparo.
-- 4. Voltar de "pronto" para "em preparo" apaga o horário de pronto (o desempenho fica certo).

-- ---------------------------------------------------------------------------
-- 1. Tempo alvo da cozinha
-- ---------------------------------------------------------------------------
alter table public.stores add column if not exists kitchen_target_minutes integer not null default 20;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'stores_kitchen_target_minutes_check') then
    alter table public.stores add constraint stores_kitchen_target_minutes_check
      check (kitchen_target_minutes between 5 and 120);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Itens prontos na cozinha
-- ---------------------------------------------------------------------------
alter table public.order_items add column if not exists kitchen_done_at timestamptz;

-- ---------------------------------------------------------------------------
-- 3. Link da cozinha (um por loja)
-- ---------------------------------------------------------------------------
create table if not exists public.kitchen_links (
  store_id uuid primary key references public.stores (id) on delete cascade,
  access_token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);
alter table public.kitchen_links enable row level security;
drop policy if exists "equipe vê o link da cozinha" on public.kitchen_links;
create policy "equipe vê o link da cozinha" on public.kitchen_links for select to authenticated
  using (public.is_store_member(store_id));
revoke all on public.kitchen_links from anon;
revoke insert, update, delete on public.kitchen_links from authenticated;

-- Cria o link (ou troca por um novo; o antigo para de funcionar na hora).
create or replace function public.kitchen_link_rotate(p_store_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid;
begin
  if not public.is_store_member(p_store_id) then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  insert into public.kitchen_links (store_id) values (p_store_id)
  on conflict (store_id) do update set access_token = gen_random_uuid(), created_at = now()
  returning access_token into v_token;
  return v_token;
end;
$$;

-- Desliga o link (a tela da cozinha só abre de novo com login ou com um link novo).
create or replace function public.kitchen_link_disable(p_store_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_store_member(p_store_id) then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  delete from public.kitchen_links where store_id = p_store_id;
end;
$$;

-- Qual loja a tela pode ver: pelo link secreto ou pela equipe logada.
-- Loja vencida ou bloqueada não abre a cozinha.
create or replace function public.kitchen_store_id(p_store_id uuid, p_token uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_store uuid;
begin
  if p_token is not null then
    select store_id into v_store from public.kitchen_links where access_token = p_token;
    if v_store is null then raise exception 'link_invalido' using errcode = 'P0001'; end if;
  elsif p_store_id is not null and public.is_store_member(p_store_id) then
    v_store := p_store_id;
  else
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.stores s where s.id = v_store and public.store_access_ok(s)) then
    raise exception 'loja_indisponivel' using errcode = 'P0001';
  end if;
  return v_store;
end;
$$;

-- Pedido como a cozinha vê: sem preços, telefone nem endereço.
create or replace function public.kitchen_order_json(o public.orders)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', o.id, 'number', o.number, 'status', o.status, 'fulfillment', o.fulfillment,
    'customer_name', o.customer_name, 'notes', o.notes, 'scheduled_for', o.scheduled_for,
    'created_at', o.created_at, 'accepted_at', o.accepted_at, 'ready_at', o.ready_at,
    'cancelled_at', o.cancelled_at, 'cancel_reason', o.cancel_reason,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'quantity', i.quantity, 'product_name', i.product_name, 'size_name', i.size_name,
        'flavors', i.flavors,
        'options', coalesce((select jsonb_agg(x->>'name') from jsonb_array_elements(i.options) x), '[]'::jsonb),
        'notes', i.notes, 'done_at', i.kitchen_done_at
      ) order by i.sort_order, i.id)
      from public.order_items i where i.order_id = o.id
    ), '[]'::jsonb)
  )
$$;

-- Tela da cozinha: pedidos novos e em preparo, prontos da última hora e cancelados há pouco.
-- Pix online ainda não pago não aparece (igual ao painel).
create or replace function public.kitchen_board(p_store_id uuid default null, p_token uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_store uuid := public.kitchen_store_id(p_store_id, p_token);
begin
  return jsonb_build_object(
    'now', now(),
    'store', (select jsonb_build_object('id', s.id, 'name', s.name, 'primary_color', s.primary_color,
                                        'logo_url', s.logo_url, 'prep_time_minutes', s.prep_time_minutes,
                                        'kitchen_target_minutes', s.kitchen_target_minutes)
              from public.stores s where s.id = v_store),
    'orders', coalesce((
      select jsonb_agg(public.kitchen_order_json(o) order by o.created_at)
      from (
        select * from public.orders o
        where o.store_id = v_store
          and o.payment_status in ('on_delivery', 'paid')
          and (
            o.status in ('pending', 'preparing')
            or (o.status = 'ready' and o.ready_at > now() - interval '60 minutes')
            or (o.status = 'cancelled' and o.cancelled_at > now() - interval '15 minutes')
          )
        order by o.created_at
        limit 300
      ) o
    ), '[]'::jsonb)
  );
end;
$$;

-- Cozinha muda o status: aceitar (novo -> em preparo), pronto (em preparo -> pronto) ou
-- voltar (pronto -> em preparo). Tocar duas vezes (ou em duas telas) não dá erro.
create or replace function public.kitchen_update(p_order_id uuid, p_status public.order_status, p_token uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store uuid;
  v_order public.orders%rowtype;
begin
  if p_token is not null then
    v_store := public.kitchen_store_id(null, p_token);
  end if;
  select * into v_order from public.orders
  where id = p_order_id and (v_store is null or store_id = v_store)
  for update;
  if not found then raise exception 'pedido_nao_encontrado' using errcode = 'P0001'; end if;
  if v_store is null then
    perform public.kitchen_store_id(v_order.store_id, null);
  end if;
  if v_order.payment_status not in ('on_delivery', 'paid') then
    raise exception 'pedido_nao_encontrado' using errcode = 'P0001';
  end if;

  if v_order.status = p_status then
    return public.kitchen_order_json(v_order);
  end if;
  if not ((v_order.status = 'pending' and p_status = 'preparing')
       or (v_order.status = 'preparing' and p_status = 'ready')
       or (v_order.status = 'ready' and p_status = 'preparing')) then
    raise exception 'status_invalido' using errcode = 'P0001';
  end if;

  update public.orders set status = p_status where id = p_order_id returning * into v_order;
  return public.kitchen_order_json(v_order);
end;
$$;

-- Cozinha risca (ou desfaz) um item pronto.
create or replace function public.kitchen_item_done(p_item_id uuid, p_done boolean, p_token uuid default null)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store uuid;
  v_item public.order_items%rowtype;
  v_status public.order_status;
begin
  if p_token is not null then
    v_store := public.kitchen_store_id(null, p_token);
  end if;
  select * into v_item from public.order_items
  where id = p_item_id and (v_store is null or store_id = v_store)
  for update;
  if not found then raise exception 'item_nao_encontrado' using errcode = 'P0001'; end if;
  if v_store is null then
    perform public.kitchen_store_id(v_item.store_id, null);
  end if;
  select status into v_status from public.orders where id = v_item.order_id;
  if v_status not in ('pending', 'preparing') then
    raise exception 'status_invalido' using errcode = 'P0001';
  end if;

  update public.order_items
  set kitchen_done_at = case when p_done then coalesce(kitchen_done_at, now()) else null end
  where id = p_item_id
  returning * into v_item;
  return v_item.kitchen_done_at;
end;
$$;

revoke execute on function public.kitchen_store_id(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.kitchen_order_json(public.orders) from public, anon, authenticated;
revoke execute on function public.kitchen_link_rotate(uuid) from public, anon;
revoke execute on function public.kitchen_link_disable(uuid) from public, anon;
grant execute on function public.kitchen_link_rotate(uuid) to authenticated;
grant execute on function public.kitchen_link_disable(uuid) to authenticated;
grant execute on function public.kitchen_board(uuid, uuid) to anon, authenticated;
grant execute on function public.kitchen_update(uuid, public.order_status, uuid) to anon, authenticated;
grant execute on function public.kitchen_item_done(uuid, boolean, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Pronto -> em preparo apaga o horário de pronto
-- ---------------------------------------------------------------------------
create or replace function public.track_order_status()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    case new.status
      when 'preparing' then
        new.accepted_at := coalesce(new.accepted_at, now());
        if old.status = 'ready' then new.ready_at := null; end if;
      when 'ready' then new.ready_at := coalesce(new.ready_at, now());
      when 'out_for_delivery' then new.dispatched_at := coalesce(new.dispatched_at, now());
      when 'delivered' then new.delivered_at := coalesce(new.delivered_at, now());
      when 'cancelled' then new.cancelled_at := coalesce(new.cancelled_at, now());
      else null;
    end case;
  end if;
  return new;
end;
$$;

-- Itens riscados aparecem na hora nas outras telas logadas (Supabase Realtime).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'order_items') then
    alter publication supabase_realtime add table public.order_items;
  end if;
end;
$$;
