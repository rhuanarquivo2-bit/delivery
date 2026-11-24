-- Fase 11: programa de fidelidade.
-- - O cliente (identificado pelo celular) ganha pontos quando o pedido é ENTREGUE:
--   (subtotal - desconto) / centavos_por_ponto, arredondado para baixo.
-- - Cliente novo ganha os pontos de boas-vindas junto com o primeiro pedido entregue.
-- - Cada lote de pontos vence `loyalty_expiry_days` dias depois (padrão 90).
-- - Recompensas: produto grátis (entra no pedido com preço zero) ou % de desconto.
-- - Para trocar pontos o cliente precisa provar que é dono do celular: o link de um
--   pedido dele guardado no aparelho (o mesmo de "Meus pedidos").
-- - Pedido cancelado: some o que ele gerou e devolve o que ele gastou.

alter table public.stores
  add column loyalty_enabled boolean not null default false,
  add column loyalty_cents_per_point integer not null default 100 check (loyalty_cents_per_point between 1 and 100000),
  add column loyalty_welcome_points integer not null default 0 check (loyalty_welcome_points between 0 and 100000),
  add column loyalty_expiry_days integer not null default 90 check (loyalty_expiry_days between 7 and 730);

create table public.loyalty_rewards (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 60),
  points_cost integer not null check (points_cost between 1 and 1000000),
  kind text not null check (kind in ('product', 'percent')),
  product_id uuid references public.products (id) on delete cascade,
  percent integer check (percent between 1 and 100),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check ((kind = 'product' and product_id is not null and percent is null)
      or (kind = 'percent' and percent is not null and product_id is null))
);
create index loyalty_rewards_store_idx on public.loyalty_rewards (store_id, points_cost);
alter table public.loyalty_rewards enable row level security;
create policy "recompensas visíveis" on public.loyalty_rewards for select
  using (active or public.is_store_member(store_id));
create policy "membros gerenciam recompensas" on public.loyalty_rewards for all to authenticated
  using (public.is_store_member(store_id))
  with check (
    public.is_store_member(store_id)
    and (product_id is null or exists (
      select 1 from public.products p where p.id = product_id and p.store_id = loyalty_rewards.store_id))
  );

-- Extrato de pontos (só escrito pelas funções abaixo).
create table public.loyalty_ledger (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  phone text not null,
  points integer not null check (points <> 0),
  kind text not null check (kind in ('earn', 'welcome', 'redeem')),
  order_id uuid references public.orders (id) on delete cascade,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  check ((kind = 'redeem') = (points < 0)),
  check ((kind = 'redeem') = (expires_at is null))
);
create index loyalty_ledger_phone_idx on public.loyalty_ledger (store_id, phone, created_at);
create unique index loyalty_ledger_once_idx on public.loyalty_ledger (order_id, kind) where order_id is not null;
alter table public.loyalty_ledger enable row level security;
create policy "membros veem o extrato" on public.loyalty_ledger for select to authenticated
  using (public.is_store_member(store_id));

alter table public.orders
  add column loyalty_reward_name text,
  add column loyalty_points_used integer check (loyalty_points_used > 0);

-- Saldo de pontos válido agora. Cada troca gasta primeiro os pontos mais antigos
-- que estavam válidos no momento da troca.
create or replace function public.loyalty_balance(p_store_id uuid, p_phone text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_lots jsonb[] := '{}';
  v_lot jsonb;
  r record;
  v_need integer;
  v_take integer;
  i integer;
  v_balance integer := 0;
  v_next_at timestamptz;
  v_next_points integer := 0;
begin
  for r in
    select points, kind, created_at, expires_at from public.loyalty_ledger
    where store_id = p_store_id and phone = p_phone
    order by created_at, kind desc
  loop
    if r.kind <> 'redeem' then
      v_lots := v_lots || jsonb_build_object('left', r.points, 'from', r.created_at, 'until', r.expires_at);
    else
      v_need := -r.points;
      for i in 1 .. coalesce(array_length(v_lots, 1), 0) loop
        exit when v_need <= 0;
        v_lot := v_lots[i];
        if (v_lot->>'left')::int > 0 and (v_lot->>'until')::timestamptz > r.created_at then
          v_take := least(v_need, (v_lot->>'left')::int);
          v_lots[i] := jsonb_set(v_lot, '{left}', to_jsonb((v_lot->>'left')::int - v_take));
          v_need := v_need - v_take;
        end if;
      end loop;
    end if;
  end loop;

  for i in 1 .. coalesce(array_length(v_lots, 1), 0) loop
    v_lot := v_lots[i];
    if (v_lot->>'left')::int > 0 and (v_lot->>'until')::timestamptz > now() then
      v_balance := v_balance + (v_lot->>'left')::int;
      if v_next_at is null or (v_lot->>'until')::timestamptz < v_next_at then
        v_next_at := (v_lot->>'until')::timestamptz;
        v_next_points := 0;
      end if;
      if (v_lot->>'until')::timestamptz::date = v_next_at::date then
        v_next_points := v_next_points + (v_lot->>'left')::int;
      end if;
    end if;
  end loop;

  return jsonb_build_object('balance', v_balance, 'expiring_points', v_next_points, 'expiring_at', v_next_at);
end;
$$;
revoke all on function public.loyalty_balance(uuid, text) from public;

-- Pontos ao entregar; desfaz ao cancelar.
create or replace function public.loyalty_on_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store public.stores;
  v_points integer;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  if new.status = 'cancelled' then
    delete from public.loyalty_ledger where order_id = new.id;
    return new;
  end if;
  if new.status <> 'delivered' then
    return new;
  end if;
  select * into v_store from public.stores where id = new.store_id;
  if not v_store.loyalty_enabled then
    return new;
  end if;
  -- cliente novo: boas-vindas junto com o primeiro pedido entregue
  if v_store.loyalty_welcome_points > 0 and not exists (
    select 1 from public.loyalty_ledger
    where store_id = new.store_id and phone = new.customer_phone and kind = 'welcome'
  ) then
    insert into public.loyalty_ledger (store_id, phone, points, kind, order_id, expires_at)
    values (new.store_id, new.customer_phone, v_store.loyalty_welcome_points, 'welcome', new.id,
            now() + make_interval(days => v_store.loyalty_expiry_days))
    on conflict do nothing;
  end if;
  v_points := floor(greatest(new.subtotal_cents - new.discount_cents, 0)::numeric / v_store.loyalty_cents_per_point);
  if v_points > 0 then
    insert into public.loyalty_ledger (store_id, phone, points, kind, order_id, expires_at)
    values (new.store_id, new.customer_phone, v_points, 'earn', new.id,
            now() + make_interval(days => v_store.loyalty_expiry_days))
    on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger orders_loyalty after update of status on public.orders
  for each row execute function public.loyalty_on_status();

-- O cliente prova que é dono do celular com o link de um pedido dele.
create or replace function public.loyalty_owner_phone(p_store_id uuid, p_phone text, p_tokens uuid[])
returns text
language sql
stable
security definer
set search_path = public
as $$
  select o.customer_phone
  from public.orders o
  where o.store_id = p_store_id
    and o.public_token = any (coalesce(p_tokens[1:50], '{}'))
    and (nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '') is null
         or o.customer_phone = regexp_replace(p_phone, '\D', '', 'g'))
  order by o.created_at desc
  limit 1;
$$;
revoke all on function public.loyalty_owner_phone(uuid, text, uuid[]) from public;

-- Site do cliente: programa da loja + saldo (se o aparelho provar o celular).
create or replace function public.loyalty_status(p_store_id uuid, p_phone text, p_tokens uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_store public.stores;
  v_phone text;
begin
  select * into v_store from public.stores where id = p_store_id;
  if not found or not v_store.loyalty_enabled then
    return jsonb_build_object('enabled', false);
  end if;
  v_phone := public.loyalty_owner_phone(p_store_id, p_phone, p_tokens);
  return jsonb_build_object(
    'enabled', true,
    'cents_per_point', v_store.loyalty_cents_per_point,
    'welcome_points', v_store.loyalty_welcome_points,
    'expiry_days', v_store.loyalty_expiry_days,
    'rewards', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'points_cost', r.points_cost,
                                          'kind', r.kind, 'percent', r.percent, 'product_id', r.product_id)
                       order by r.points_cost, r.name)
      from public.loyalty_rewards r
      left join public.products p on p.id = r.product_id
      where r.store_id = p_store_id and r.active and (r.product_id is null or p.active)
    ), '[]'::jsonb),
    'verified', v_phone is not null,
    'phone_end', right(v_phone, 4),
    'points', case when v_phone is not null then public.loyalty_balance(p_store_id, v_phone) end
  );
end;
$$;

-- place_order passa a aceitar a troca de pontos. A versão anterior vira place_order_core.
alter function public.place_order(uuid, jsonb) rename to place_order_core;
revoke all on function public.place_order_core(uuid, jsonb) from public, anon, authenticated;

create or replace function public.place_order(p_store_id uuid, p_order jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reward_id uuid;
  v_reward public.loyalty_rewards;
  v_store public.stores;
  v_phone text := regexp_replace(coalesce(p_order->>'customer_phone', ''), '\D', '', 'g');
  v_tokens uuid[];
  v_result jsonb;
  v_order public.orders;
  v_balance integer;
  v_discount integer;
  v_product public.products;
begin
  begin
    v_reward_id := nullif(p_order->>'loyalty_reward_id', '')::uuid;
  exception when others then
    raise exception 'recompensa_invalida' using errcode = 'P0001';
  end;

  if v_reward_id is null then
    return public.place_order_core(p_store_id, p_order - 'loyalty_reward_id' - 'loyalty_tokens');
  end if;

  select * into v_store from public.stores where id = p_store_id;
  select * into v_reward from public.loyalty_rewards where id = v_reward_id and store_id = p_store_id and active;
  if not found or not coalesce(v_store.loyalty_enabled, false) then
    raise exception 'recompensa_invalida' using errcode = 'P0001';
  end if;
  begin
    select coalesce(array_agg(t::uuid), '{}') into v_tokens
    from jsonb_array_elements_text(coalesce(p_order->'loyalty_tokens', '[]'::jsonb)) t;
  exception when others then
    v_tokens := '{}';
  end;
  if public.loyalty_owner_phone(p_store_id, v_phone, v_tokens) is null then
    raise exception 'pontos_sem_acesso' using errcode = 'P0001';
  end if;

  -- uma troca por vez para o mesmo celular
  perform pg_advisory_xact_lock(hashtext(p_store_id::text || ':' || v_phone));
  v_balance := (public.loyalty_balance(p_store_id, v_phone)->>'balance')::int;
  if v_balance < v_reward.points_cost then
    raise exception 'pontos_insuficientes' using errcode = 'P0001';
  end if;

  v_result := public.place_order_core(p_store_id, p_order - 'loyalty_reward_id' - 'loyalty_tokens');
  select * into v_order from public.orders where id = (v_result->>'id')::uuid;

  if v_reward.kind = 'percent' then
    v_discount := round((v_order.subtotal_cents - v_order.discount_cents) * v_reward.percent / 100.0)::int;
    v_discount := least(greatest(v_discount, 0), v_order.subtotal_cents - v_order.discount_cents);
    update public.orders
      set discount_cents = discount_cents + v_discount,
          total_cents = total_cents - v_discount,
          loyalty_reward_name = v_reward.name,
          loyalty_points_used = v_reward.points_cost
      where id = v_order.id
      returning * into v_order;
    if v_order.change_for_cents is not null and v_order.change_for_cents <= v_order.total_cents then
      raise exception 'troco_invalido' using errcode = 'P0001';
    end if;
  else
    select * into v_product from public.products where id = v_reward.product_id and active;
    if not found then
      raise exception 'recompensa_invalida' using errcode = 'P0001';
    end if;
    insert into public.order_items (order_id, store_id, product_id, product_name, quantity, unit_price_cents, total_cents, notes, sort_order)
    values (v_order.id, p_store_id, v_product.id, v_product.name, 1, 0, 0, 'Brinde da fidelidade: ' || v_reward.name, 999);
    update public.orders
      set loyalty_reward_name = v_reward.name, loyalty_points_used = v_reward.points_cost
      where id = v_order.id
      returning * into v_order;
  end if;

  insert into public.loyalty_ledger (store_id, phone, points, kind, order_id)
  values (p_store_id, v_phone, -v_reward.points_cost, 'redeem', v_order.id);

  return v_result || jsonb_build_object('total_cents', v_order.total_cents);
end;
$$;

-- Painel: clientes com saldo, do mais perto de uma recompensa para o mais longe.
create or replace function public.loyalty_customers(p_store_id uuid)
returns table (phone text, name text, balance integer, expiring_points integer, expiring_at timestamptz,
               next_reward text, missing integer, can_redeem text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_store_member(p_store_id) then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  return query
  with phones as (
    select distinct l.phone from public.loyalty_ledger l where l.store_id = p_store_id
  ),
  bal as (
    select ph.phone, public.loyalty_balance(p_store_id, ph.phone) as b from phones ph
  ),
  named as (
    select bal.phone, bal.b,
      (select o.customer_name from public.orders o
       where o.store_id = p_store_id and o.customer_phone = bal.phone
       order by o.created_at desc limit 1) as name
    from bal
  )
  select n.phone, n.name, (n.b->>'balance')::int, (n.b->>'expiring_points')::int, (n.b->>'expiring_at')::timestamptz,
    nxt.name, nxt.points_cost - (n.b->>'balance')::int,
    can.name
  from named n
  left join lateral (
    select r.name, r.points_cost from public.loyalty_rewards r
    where r.store_id = p_store_id and r.active and r.points_cost > (n.b->>'balance')::int
    order by r.points_cost limit 1
  ) nxt on true
  left join lateral (
    select r.name from public.loyalty_rewards r
    where r.store_id = p_store_id and r.active and r.points_cost <= (n.b->>'balance')::int
    order by r.points_cost desc limit 1
  ) can on true
  where (n.b->>'balance')::int > 0
  order by (can.name is null), coalesce(nxt.points_cost - (n.b->>'balance')::int, 0), (n.b->>'balance')::int desc;
end;
$$;

-- get_public_order mostra a recompensa usada
create or replace function public.get_public_order_loyalty(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('reward_name', o.loyalty_reward_name, 'points_used', o.loyalty_points_used,
    'points_earned', (select sum(l.points) from public.loyalty_ledger l where l.order_id = o.id and l.points > 0),
    'enabled', s.loyalty_enabled,
    'points_to_earn', case when s.loyalty_enabled then floor(greatest(o.subtotal_cents - o.discount_cents, 0)::numeric / s.loyalty_cents_per_point) end)
  from public.orders o join public.stores s on s.id = o.store_id
  where o.public_token = p_token;
$$;

revoke all on function public.loyalty_status(uuid, text, uuid[]) from public;
revoke all on function public.place_order(uuid, jsonb) from public;
revoke all on function public.loyalty_customers(uuid) from public;
revoke all on function public.get_public_order_loyalty(uuid) from public;
grant execute on function public.loyalty_status(uuid, text, uuid[]) to anon, authenticated;
grant execute on function public.place_order(uuid, jsonb) to anon, authenticated;
grant execute on function public.loyalty_customers(uuid) to authenticated;
grant execute on function public.get_public_order_loyalty(uuid) to anon, authenticated;
