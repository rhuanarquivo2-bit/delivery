-- Fase 5: motoboys
-- Cadastro dos motoboys, quem leva cada pedido, taxa por entrega, site do motoboy
-- (link secreto, sem login) e acerto por dia.

create type public.courier_fee_mode as enum (
  'fixed',        -- valor fixo por entrega
  'zone_fee'      -- a taxa do bairro (mesmo se o cliente ganhou entrega grátis)
);

create table public.couriers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 60),
  phone text check (phone ~ '^\d{10,13}$'),
  pix_key text check (char_length(pix_key) <= 120),
  fee_mode public.courier_fee_mode not null default 'fixed',
  fee_cents integer not null default 0 check (fee_cents between 0 and 100000),
  -- diária: entra no dia em que o motoboy fez pelo menos uma entrega
  daily_rate_cents integer not null default 0 check (daily_rate_cents between 0 and 1000000),
  active boolean not null default true,
  -- link do site do motoboy (/entregador/<token>); trocar o token derruba o link antigo
  access_token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);
create index couriers_store_idx on public.couriers (store_id, active, name);

alter table public.orders
  add column courier_id uuid references public.couriers (id) on delete restrict,
  -- taxa do motoboy, gravada na hora em que ele recebe o pedido
  add column courier_fee_cents integer check (courier_fee_cents >= 0),
  add column assigned_at timestamptz;
create index orders_courier_idx on public.orders (courier_id, delivered_at) where courier_id is not null;

-- Acerto pago (um registro por motoboy e dia).
create table public.courier_payouts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  courier_id uuid not null references public.couriers (id) on delete cascade,
  day date not null,
  amount_cents integer not null check (amount_cents >= 0),
  paid_at timestamptz not null default now(),
  paid_by uuid references auth.users (id) on delete set null,
  unique (courier_id, day)
);

-- Dia (Brasília) de um instante.
create or replace function public.br_day(p_at timestamptz)
returns date
language sql
immutable
as $$ select (p_at at time zone 'America/Sao_Paulo')::date $$;

-- ---------------------------------------------------------------------------
-- Escolher o motoboy de um pedido (painel). p_courier_id null tira o motoboy.
-- ---------------------------------------------------------------------------
create or replace function public.assign_courier(p_order_id uuid, p_courier_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_courier public.couriers%rowtype;
  v_fee integer;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or not public.is_store_member(v_order.store_id) then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  if v_order.fulfillment <> 'delivery' then raise exception 'pedido_retirada'; end if;
  if v_order.status in ('delivered', 'cancelled') or v_order.payment_status not in ('on_delivery', 'paid') then
    raise exception 'pedido_encerrado';
  end if;

  if p_courier_id is null then
    update public.orders set courier_id = null, courier_fee_cents = null, assigned_at = null
      where id = p_order_id returning * into v_order;
    return to_jsonb(v_order);
  end if;

  select * into v_courier from public.couriers
    where id = p_courier_id and store_id = v_order.store_id and active;
  if not found then raise exception 'motoboy_invalido'; end if;

  v_fee := case v_courier.fee_mode
    when 'fixed' then v_courier.fee_cents
    else coalesce((select fee_cents from public.delivery_zones where id = v_order.delivery_zone_id),
                  v_order.delivery_fee_cents)
  end;

  update public.orders
    set courier_id = v_courier.id, courier_fee_cents = v_fee, assigned_at = now()
    where id = p_order_id returning * into v_order;
  return to_jsonb(v_order);
end;
$$;

-- ---------------------------------------------------------------------------
-- Site do motoboy: tudo pelo link secreto, sem login.
-- ---------------------------------------------------------------------------
create or replace function public.courier_portal(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_courier public.couriers%rowtype;
  v_today date := public.br_day(now());
begin
  select * into v_courier from public.couriers where access_token = p_token and active;
  if not found then return null; end if;

  return jsonb_build_object(
    'courier', jsonb_build_object('name', v_courier.name, 'fee_mode', v_courier.fee_mode,
                                  'fee_cents', v_courier.fee_cents, 'daily_rate_cents', v_courier.daily_rate_cents),
    'store', (select jsonb_build_object('name', s.name, 'whatsapp', s.whatsapp, 'phone', s.phone,
                                        'primary_color', s.primary_color, 'logo_url', s.logo_url,
                                        'address_city', s.address_city, 'address_state', s.address_state)
              from public.stores s where s.id = v_courier.store_id),
    'today', v_today,
    -- em aberto: tudo que está com ele e ainda não foi entregue (de qualquer dia)
    'open', coalesce((
      select jsonb_agg(public.courier_order_json(o) order by o.assigned_at)
      from public.orders o
      where o.courier_id = v_courier.id and o.status not in ('delivered', 'cancelled')
    ), '[]'::jsonb),
    'delivered_today', coalesce((
      select jsonb_agg(public.courier_order_json(o) order by o.delivered_at desc)
      from public.orders o
      where o.courier_id = v_courier.id and o.status = 'delivered' and public.br_day(o.delivered_at) = v_today
    ), '[]'::jsonb),
    'days', coalesce((
      select jsonb_agg(d order by d->>'day' desc)
      from (
        select public.courier_day_json(v_courier, x.day::date) as d
        from generate_series(v_today - 6, v_today, interval '1 day') as x(day)
      ) t
      where (d->>'deliveries')::int > 0
    ), '[]'::jsonb)
  );
end;
$$;

-- Pedido como o motoboy vê (sem dados que ele não precisa).
create or replace function public.courier_order_json(o public.orders)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', o.id, 'number', o.number, 'status', o.status,
    'customer_name', o.customer_name, 'customer_phone', o.customer_phone,
    'address_street', o.address_street, 'address_number', o.address_number,
    'address_complement', o.address_complement, 'address_district', o.address_district,
    'address_reference', o.address_reference, 'notes', o.notes,
    'payment_method', o.payment_method, 'payment_status', o.payment_status,
    'total_cents', o.total_cents, 'change_for_cents', o.change_for_cents,
    'courier_fee_cents', o.courier_fee_cents,
    'items_count', (select coalesce(sum(i.quantity), 0) from public.order_items i where i.order_id = o.id),
    'assigned_at', o.assigned_at, 'dispatched_at', o.dispatched_at, 'delivered_at', o.delivered_at
  )
$$;

-- Resumo de um dia de um motoboy: entregas, taxas, diária e o que ele recebeu dos clientes.
create or replace function public.courier_day_json(c public.couriers, p_day date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with d as (
    select o.* from public.orders o
    where o.courier_id = c.id and o.status = 'delivered' and public.br_day(o.delivered_at) = p_day
  ), s as (
    select count(*)::int as deliveries,
           coalesce(sum(courier_fee_cents), 0)::int as fees,
           coalesce(sum(total_cents) filter (where payment_method = 'cash'), 0)::int as cash,
           coalesce(sum(total_cents) filter (where payment_method = 'card_delivery'), 0)::int as card,
           coalesce(sum(total_cents) filter (where payment_method = 'pix_delivery'), 0)::int as pix
    from d
  )
  select jsonb_build_object(
    'day', p_day,
    'deliveries', s.deliveries,
    'fees_cents', s.fees,
    'daily_rate_cents', case when s.deliveries > 0 then c.daily_rate_cents else 0 end,
    'earned_cents', s.fees + case when s.deliveries > 0 then c.daily_rate_cents else 0 end,
    'cash_cents', s.cash,
    'card_cents', s.card,
    'pix_delivery_cents', s.pix,
    'paid_cents', (select amount_cents from public.courier_payouts p where p.courier_id = c.id and p.day = p_day),
    'paid_at', (select paid_at from public.courier_payouts p where p.courier_id = c.id and p.day = p_day)
  )
  from s
$$;

-- Motoboy avisa que saiu ou que entregou.
create or replace function public.courier_update(p_token uuid, p_order_id uuid, p_action text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_courier public.couriers%rowtype;
  v_order public.orders%rowtype;
begin
  select * into v_courier from public.couriers where access_token = p_token and active;
  if not found then raise exception 'link_invalido'; end if;
  select * into v_order from public.orders where id = p_order_id and courier_id = v_courier.id for update;
  if not found then raise exception 'pedido_nao_encontrado'; end if;

  if p_action = 'dispatch' then
    if v_order.status not in ('preparing', 'ready') then raise exception 'status_invalido'; end if;
    update public.orders set status = 'out_for_delivery' where id = p_order_id;
    return 'out_for_delivery';
  elsif p_action = 'deliver' then
    if v_order.status not in ('preparing', 'ready', 'out_for_delivery') then raise exception 'status_invalido'; end if;
    update public.orders set status = 'delivered',
      dispatched_at = coalesce(dispatched_at, now()) where id = p_order_id;
    return 'delivered';
  end if;
  raise exception 'acao_invalida';
end;
$$;

-- ---------------------------------------------------------------------------
-- Acerto (painel): um registro por motoboy e dia no período.
-- ---------------------------------------------------------------------------
create or replace function public.courier_report(p_store_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_store_member(p_store_id) then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  if p_to < p_from or p_to - p_from > 366 then raise exception 'periodo_invalido'; end if;

  return coalesce((
    select jsonb_agg(
             public.courier_day_json(c, x.day) || jsonb_build_object('courier_id', c.id, 'courier_name', c.name)
             order by x.day desc, c.name)
    from public.couriers c
    cross join lateral (
      select distinct public.br_day(o.delivered_at) as day
      from public.orders o
      where o.courier_id = c.id and o.status = 'delivered'
        and o.delivered_at >= (p_from::timestamp at time zone 'America/Sao_Paulo')
        and o.delivered_at < ((p_to + 1)::timestamp at time zone 'America/Sao_Paulo')
    ) x
    where c.store_id = p_store_id
  ), '[]'::jsonb);
end;
$$;

-- Marca (ou desmarca) o acerto de um dia como pago. O valor é recalculado aqui.
create or replace function public.set_courier_payout(p_courier_id uuid, p_day date, p_paid boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_courier public.couriers%rowtype;
  v_day jsonb;
begin
  select * into v_courier from public.couriers where id = p_courier_id;
  if not found or not public.is_store_member(v_courier.store_id) then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  if p_paid then
    v_day := public.courier_day_json(v_courier, p_day);
    if (v_day->>'deliveries')::int = 0 then raise exception 'sem_entregas'; end if;
    insert into public.courier_payouts (store_id, courier_id, day, amount_cents, paid_by)
      values (v_courier.store_id, v_courier.id, p_day, (v_day->>'earned_cents')::int, auth.uid())
      on conflict (courier_id, day) do update set amount_cents = excluded.amount_cents,
        paid_at = now(), paid_by = excluded.paid_by;
  else
    delete from public.courier_payouts where courier_id = p_courier_id and day = p_day;
  end if;
  return public.courier_day_json(v_courier, p_day);
end;
$$;

-- ---------------------------------------------------------------------------
-- Acesso
-- ---------------------------------------------------------------------------
alter table public.couriers enable row level security;
alter table public.courier_payouts enable row level security;

create policy "membros gerenciam motoboys" on public.couriers for all to authenticated
  using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));
revoke all on public.couriers from anon;

create policy "membros veem acertos" on public.courier_payouts for select to authenticated
  using (public.is_store_member(store_id));
revoke all on public.courier_payouts from anon;
revoke insert, update, delete on public.courier_payouts from authenticated;

-- Funções internas: só usadas pelas outras (definer).
revoke execute on function public.courier_order_json(public.orders) from public, anon, authenticated;
revoke execute on function public.courier_day_json(public.couriers, date) from public, anon, authenticated;

revoke execute on function public.assign_courier(uuid, uuid) from public, anon;
revoke execute on function public.courier_report(uuid, date, date) from public, anon;
revoke execute on function public.set_courier_payout(uuid, date, boolean) from public, anon;
grant execute on function public.assign_courier(uuid, uuid) to authenticated;
grant execute on function public.courier_report(uuid, date, date) to authenticated;
grant execute on function public.set_courier_payout(uuid, date, boolean) to authenticated;
grant execute on function public.courier_portal(uuid) to anon, authenticated;
grant execute on function public.courier_update(uuid, uuid, text) to anon, authenticated;
