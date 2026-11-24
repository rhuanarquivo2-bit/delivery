-- Fase 7: pedido agendado, clientes, desempenho, janela de promoções, CEP, via da cozinha,
-- Facebook Pixel e Google Analytics.

-- ---------------------------------------------------------------------------
-- Configurações novas da loja
-- ---------------------------------------------------------------------------
alter table public.stores
  -- pedido agendado: o cliente escolhe dia e horário (até N dias à frente; 0 = só hoje)
  add column accepts_scheduled boolean not null default false,
  add column schedule_days_ahead smallint not null default 2 check (schedule_days_ahead between 0 and 7),
  -- janela com as promoções do dia quando o cliente abre o site
  add column show_promo_popup boolean not null default false,
  -- comprovante: imprime também a via da cozinha (sem preços, letra maior)
  add column print_kitchen_copy boolean not null default false,
  -- marketing: só os códigos (o formato é conferido aqui, então nunca vira código no site)
  add column facebook_pixel_id text check (facebook_pixel_id ~ '^[0-9]{6,20}$'),
  add column google_analytics_id text check (google_analytics_id ~ '^G-[A-Z0-9]{4,16}$');

alter table public.orders
  -- null = pedido para agora
  add column scheduled_for timestamptz,
  add column address_zip text check (address_zip ~ '^[0-9]{8}$');
create index orders_scheduled_idx on public.orders (store_id, scheduled_for) where scheduled_for is not null;

-- Loja de demonstração já vem com agendamento e janela de promoções ligados.
create or replace function public.demo_store_defaults()
returns trigger
language plpgsql
as $$
begin
  if new.is_demo then
    new.accepts_scheduled := true;
    new.show_promo_popup := true;
    new.print_kitchen_copy := true;
  end if;
  return new;
end;
$$;
create trigger stores_demo_defaults
  before insert on public.stores
  for each row execute function public.demo_store_defaults();

-- ---------------------------------------------------------------------------
-- A loja funciona nesse momento pelo horário cadastrado? (ignora o abrir/fechar manual)
-- Mesma regra de is_store_open e de src/lib/hours.ts.
-- ---------------------------------------------------------------------------
create or replace function public.store_hours_cover(p_store_id uuid, p_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with m as (
    select extract(dow from (p_at at time zone 'America/Sao_Paulo'))::int as dia,
           (p_at at time zone 'America/Sao_Paulo')::time as hora
  )
  select exists (
    select 1
    from public.store_hours h, m
    where h.store_id = p_store_id
      and (
        (h.weekday = m.dia and (
          (h.closes_at > h.opens_at and m.hora >= h.opens_at and m.hora < h.closes_at)
          or (h.closes_at <= h.opens_at and m.hora >= h.opens_at)
        ))
        or (h.weekday = (m.dia + 6) % 7 and h.closes_at <= h.opens_at and m.hora < h.closes_at)
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Fazer pedido (substitui o da fase 4): aceita scheduled_for e address_zip.
-- Pedido para agora: a loja precisa estar aberta.
-- Pedido agendado: a loja precisa aceitar agendamento e o horário escolhido precisa
--   ser de 15 em 15 minutos, dentro do horário de funcionamento, depois do tempo de preparo
--   e até schedule_days_ahead dias à frente. Loja fechada manualmente não recebe agendamento
--   para o mesmo dia.
-- ---------------------------------------------------------------------------
create or replace function public.place_order(p_store_id uuid, p_order jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store public.stores%rowtype;
  v_name text := btrim(coalesce(p_order->>'customer_name', ''));
  v_phone text := regexp_replace(coalesce(p_order->>'customer_phone', ''), '\D', '', 'g');
  v_document text := nullif(regexp_replace(coalesce(p_order->>'customer_document', ''), '\D', '', 'g'), '');
  v_zip text := nullif(regexp_replace(coalesce(p_order->>'address_zip', ''), '\D', '', 'g'), '');
  v_scheduled timestamptz;
  v_local timestamp;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v jsonb;
  v_delivery boolean;
  v_number integer;
  v_order public.orders%rowtype;
begin
  -- trava a loja: numera os pedidos em sequência e evita estourar o limite de um cupom
  select * into v_store from public.stores where id = p_store_id for update;
  if not found then raise exception 'loja_nao_encontrada'; end if;

  begin
    v_scheduled := nullif(p_order->>'scheduled_for', '')::timestamptz;
  exception when others then
    raise exception 'agendamento_invalido';
  end;

  if v_scheduled is null then
    if not public.is_store_open(p_store_id) then raise exception 'loja_fechada'; end if;
  else
    if not v_store.accepts_scheduled then raise exception 'agendamento_indisponivel'; end if;
    v_local := v_scheduled at time zone 'America/Sao_Paulo';
    if extract(second from v_local) <> 0 or extract(minute from v_local)::int % 15 <> 0 then
      raise exception 'agendamento_invalido';
    end if;
    -- 5 min de folga para quem demorou no checkout
    if v_scheduled < now() + make_interval(mins => v_store.prep_time_minutes - 5) then
      raise exception 'agendamento_cedo';
    end if;
    if v_local::date > v_today + v_store.schedule_days_ahead then raise exception 'agendamento_longe'; end if;
    if not public.store_hours_cover(p_store_id, v_scheduled)
       or (v_store.open_override = false and v_local::date = v_today) then
      raise exception 'agendamento_fora_horario';
    end if;
  end if;

  if char_length(v_name) not between 2 and 80 then raise exception 'nome_invalido'; end if;
  if char_length(v_phone) not between 10 and 13 then raise exception 'telefone_invalido'; end if;
  if v_document is not null and char_length(v_document) not in (11, 14) then raise exception 'documento_invalido'; end if;
  if v_zip is not null and char_length(v_zip) <> 8 then raise exception 'cep_invalido'; end if;
  if p_order->>'payment_method' = 'pix_online' and v_document is null and v_store.pix_provider = 'asaas' then
    raise exception 'documento_obrigatorio';
  end if;

  v := public.price_order(p_store_id, p_order, true);
  v_delivery := v->>'fulfillment' = 'delivery';

  select coalesce(max(number), 0) + 1 into v_number from public.orders where store_id = p_store_id;

  insert into public.orders (
    store_id, number, fulfillment, customer_name, customer_phone,
    address_street, address_number, address_complement, address_district, address_reference, address_zip,
    delivery_zone_id, subtotal_cents, delivery_fee_cents, discount_cents, total_cents,
    payment_method, change_for_cents, notes, coupon_id, coupon_code, payment_status, customer_document,
    scheduled_for
  ) values (
    p_store_id, v_number, (v->>'fulfillment')::public.fulfillment_type, v_name, v_phone,
    case when v_delivery then left(btrim(p_order->>'address_street'), 120) end,
    case when v_delivery then left(btrim(p_order->>'address_number'), 20) end,
    case when v_delivery then nullif(left(btrim(coalesce(p_order->>'address_complement', '')), 80), '') end,
    case when v_delivery then v->>'zone_name' end,
    case when v_delivery then nullif(left(btrim(coalesce(p_order->>'address_reference', '')), 120), '') end,
    case when v_delivery then v_zip end,
    case when v_delivery then (v->>'zone_id')::uuid end,
    (v->>'subtotal_cents')::integer, (v->>'delivery_fee_cents')::integer,
    (v->>'discount_cents')::integer, (v->>'total_cents')::integer,
    (v->>'payment_method')::public.payment_method, (v->>'change_for_cents')::integer,
    nullif(left(btrim(coalesce(p_order->>'notes', '')), 300), ''),
    (v->>'coupon_id')::uuid, v->>'coupon_code',
    case when v->>'payment_method' = 'pix_online' then 'awaiting' else 'on_delivery' end::public.payment_status,
    v_document,
    v_scheduled
  ) returning * into v_order;

  insert into public.order_items (
    order_id, store_id, product_id, product_name, size_name, flavors, options,
    quantity, unit_price_cents, original_unit_price_cents, promotion_name, total_cents, notes, sort_order
  )
  select v_order.id, p_store_id, i.product_id, i.product_name, i.size_name,
         (select array_agg(f) from jsonb_array_elements_text(i.flavors) f),
         i.options, i.quantity, i.unit_price_cents, i.original_unit_price_cents, i.promotion_name,
         i.total_cents, i.notes, i.sort_order
  from jsonb_to_recordset(v->'items') as i(
    product_id uuid, product_name text, size_name text, flavors jsonb, options jsonb,
    quantity integer, unit_price_cents integer, original_unit_price_cents integer, promotion_name text,
    total_cents integer, notes text, sort_order integer
  );

  return jsonb_build_object('id', v_order.id, 'number', v_order.number, 'token', v_order.public_token,
                            'total_cents', v_order.total_cents, 'payment_status', v_order.payment_status);
end;
$$;

-- Acompanhamento do cliente (substitui o da fase 4): inclui o horário agendado.
create or replace function public.get_public_order(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'number', o.number,
    'status', o.status,
    'fulfillment', o.fulfillment,
    'customer_name', o.customer_name,
    'address_street', o.address_street,
    'address_number', o.address_number,
    'address_district', o.address_district,
    'subtotal_cents', o.subtotal_cents,
    'delivery_fee_cents', o.delivery_fee_cents,
    'discount_cents', o.discount_cents,
    'coupon_code', o.coupon_code,
    'total_cents', o.total_cents,
    'payment_method', o.payment_method,
    'payment_status', o.payment_status,
    'paid_at', o.paid_at,
    'scheduled_for', o.scheduled_for,
    'pix', (
      select jsonb_build_object('qr_code', p.qr_code, 'qr_base64', p.qr_base64, 'expires_at', p.expires_at)
      from public.order_payments p
      where p.order_id = o.id and o.payment_status = 'awaiting'
    ),
    'change_for_cents', o.change_for_cents,
    'created_at', o.created_at,
    'accepted_at', o.accepted_at,
    'ready_at', o.ready_at,
    'dispatched_at', o.dispatched_at,
    'delivered_at', o.delivered_at,
    'cancelled_at', o.cancelled_at,
    'store', jsonb_build_object('name', s.name, 'slug', s.slug, 'whatsapp', s.whatsapp,
                                'primary_color', s.primary_color, 'logo_url', s.logo_url,
                                'prep_time_minutes', s.prep_time_minutes),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_name', i.product_name, 'size_name', i.size_name, 'flavors', i.flavors,
        'options', i.options, 'quantity', i.quantity, 'total_cents', i.total_cents, 'notes', i.notes,
        'original_unit_price_cents', i.original_unit_price_cents, 'promotion_name', i.promotion_name
      ) order by i.sort_order)
      from public.order_items i where i.order_id = o.id
    ), '[]'::jsonb)
  )
  from public.orders o
  join public.stores s on s.id = o.store_id
  where o.public_token = p_token;
$$;

-- ---------------------------------------------------------------------------
-- Clientes: um por celular, montado a partir dos pedidos (Pix não pago fica de fora).
-- ---------------------------------------------------------------------------
create or replace function public.customer_report(p_store_id uuid)
returns table (
  phone text,
  name text,
  orders integer,
  cancelled integer,
  total_cents bigint,
  first_order_at timestamptz,
  last_order_at timestamptz,
  district text
)
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if not public.is_store_member(p_store_id) then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  return query
    select o.customer_phone,
           (array_agg(o.customer_name order by o.created_at desc))[1],
           (count(*) filter (where o.status <> 'cancelled'))::integer,
           (count(*) filter (where o.status = 'cancelled'))::integer,
           coalesce(sum(o.total_cents) filter (where o.status <> 'cancelled'), 0)::bigint,
           min(o.created_at),
           max(o.created_at),
           (array_agg(o.address_district order by o.created_at desc) filter (where o.address_district is not null))[1]
    from public.orders o
    where o.store_id = p_store_id and o.payment_status in ('on_delivery', 'paid')
    group by o.customer_phone
    order by max(o.created_at) desc
    limit 5000;
end;
$$;

-- ---------------------------------------------------------------------------
-- Desempenho: horários de pico, dias da semana, tempos, clientes novos e bairros.
-- Mesmo recorte do financeiro (horário de Brasília, Pix não pago fica de fora).
-- ---------------------------------------------------------------------------
create or replace function public.performance_report(p_store_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_start timestamptz := (p_from::timestamp at time zone 'America/Sao_Paulo');
  v_end timestamptz := ((p_to + 1)::timestamp at time zone 'America/Sao_Paulo');
  v jsonb;
begin
  if not public.is_store_member(p_store_id) then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  if p_to < p_from or p_to - p_from > 366 then raise exception 'periodo_invalido'; end if;

  with base as (
    select o.*, o.created_at at time zone 'America/Sao_Paulo' as local_at
    from public.orders o
    where o.store_id = p_store_id
      and o.created_at >= v_start and o.created_at < v_end
      and o.payment_status in ('on_delivery', 'paid')
  ),
  ok as (select * from base where status <> 'cancelled'),
  -- primeiro pedido de cada cliente na loja (em qualquer data)
  firsts as (
    select o.customer_phone, min(o.created_at) as first_at
    from public.orders o
    where o.store_id = p_store_id and o.payment_status in ('on_delivery', 'paid') and o.status <> 'cancelled'
      and o.customer_phone in (select customer_phone from ok)
    group by o.customer_phone
  )
  select jsonb_build_object(
    'orders', (select count(*) from ok),
    'gross_cents', (select coalesce(sum(total_cents), 0) from ok),
    'cancelled_orders', (select count(*) from base where status = 'cancelled'),
    'scheduled_orders', (select count(*) from ok where scheduled_for is not null),
    'customers', (select count(distinct customer_phone) from ok),
    'new_customers', (select count(*) from firsts where first_at >= v_start and first_at < v_end),
    -- tempos em minutos (pedido agendado fica fora do preparo e da entrega: ele espera de propósito)
    'avg_accept_minutes', (
      select round(avg(extract(epoch from accepted_at - created_at) / 60)::numeric, 1)
      from ok where accepted_at is not null
    ),
    'avg_prep_minutes', (
      select round(avg(extract(epoch from ready_at - accepted_at) / 60)::numeric, 1)
      from ok where ready_at is not null and accepted_at is not null and scheduled_for is null
    ),
    'avg_total_minutes', (
      select round(avg(extract(epoch from delivered_at - created_at) / 60)::numeric, 1)
      from ok where delivered_at is not null and fulfillment = 'delivery' and scheduled_for is null
    ),
    'by_hour', (
      select jsonb_agg(jsonb_build_object('hour', h, 'orders', coalesce(x.n, 0), 'cents', coalesce(x.cents, 0)) order by h)
      from generate_series(0, 23) h
      left join (select extract(hour from local_at)::int as hr, count(*) as n, sum(total_cents) as cents
                 from ok group by 1) x on x.hr = h
    ),
    'by_weekday', (
      select jsonb_agg(jsonb_build_object('weekday', d, 'orders', coalesce(x.n, 0), 'cents', coalesce(x.cents, 0)) order by d)
      from generate_series(0, 6) d
      left join (select extract(dow from local_at)::int as dw, count(*) as n, sum(total_cents) as cents
                 from ok group by 1) x on x.dw = d
    ),
    'top_districts', (
      select coalesce(jsonb_agg(jsonb_build_object('name', t.district, 'orders', t.n, 'cents', t.cents)
                                order by t.n desc, t.cents desc), '[]'::jsonb)
      from (
        select address_district as district, count(*) as n, sum(total_cents) as cents
        from ok where fulfillment = 'delivery' and address_district is not null
        group by address_district
        order by count(*) desc, sum(total_cents) desc
        limit 8
      ) t
    )
  ) into v;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Acesso
-- ---------------------------------------------------------------------------
revoke execute on function public.store_hours_cover(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.place_order(uuid, jsonb) to anon, authenticated;
grant execute on function public.get_public_order(uuid) to anon, authenticated;
revoke execute on function public.customer_report(uuid) from public, anon;
grant execute on function public.customer_report(uuid) to authenticated;
revoke execute on function public.performance_report(uuid, date, date) from public, anon;
grant execute on function public.performance_report(uuid, date, date) to authenticated;
