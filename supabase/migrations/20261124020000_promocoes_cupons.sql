-- Fase 3: promoções programadas, cupons de desconto e importação do cardápio por foto.
-- Tudo que mexe em preço é recalculado aqui no banco; o site só mostra uma prévia.

-- ---------------------------------------------------------------------------
-- Promoções (desconto em produto ou categoria, com dias e horários)
-- ---------------------------------------------------------------------------
create type public.discount_kind as enum ('percent', 'fixed');

create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  kind public.discount_kind not null,
  -- percent: 1 a 90 (%); fixed: centavos de desconto por unidade
  value integer not null,
  product_id uuid references public.products (id) on delete cascade,
  category_id uuid references public.categories (id) on delete cascade,
  -- 0 = domingo ... 6 = sábado; null = todos os dias
  weekdays smallint[] check (
    weekdays is null
    or (cardinality(weekdays) between 1 and 7 and weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[])
  ),
  starts_on date,
  ends_on date,
  -- faixa de horário opcional (ex.: happy hour 18:00 às 20:00); fim <= início passa da meia-noite
  start_time time,
  end_time time,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (num_nonnulls(product_id, category_id) = 1),
  check ((kind = 'percent' and value between 1 and 90) or (kind = 'fixed' and value > 0)),
  check (ends_on is null or starts_on is null or ends_on >= starts_on),
  check ((start_time is null) = (end_time is null))
);
create index promotions_store_idx on public.promotions (store_id);
create index promotions_product_idx on public.promotions (product_id) where product_id is not null;
create index promotions_category_idx on public.promotions (category_id) where category_id is not null;

-- Hora local da loja (todas as lojas usam o horário de Brasília por enquanto).
create or replace function public.store_local_now()
returns timestamp
language sql
stable
as $$
  select (now() at time zone 'America/Sao_Paulo');
$$;

create or replace function public.promotion_is_live(p public.promotions, p_local timestamp)
returns boolean
language sql
immutable
as $$
  select p.active
    and (p.starts_on is null or p_local::date >= p.starts_on)
    and (p.ends_on is null or p_local::date <= p.ends_on)
    and (p.weekdays is null or extract(dow from p_local)::smallint = any (p.weekdays))
    and (
      p.start_time is null
      or case
        when p.end_time > p.start_time then p_local::time >= p.start_time and p_local::time < p.end_time
        else p_local::time >= p.start_time or p_local::time < p.end_time
      end
    );
$$;

-- Melhor preço de um produto agora: a promoção que deixa mais barato, ou o preço cheio.
create or replace function public.promo_price(
  p_product_id uuid, p_category_id uuid, p_price integer, p_local timestamp
)
returns table (price_cents integer, promotion_name text)
language sql
stable
set search_path = public
as $$
  select x.price_cents, x.promotion_name
  from (
    select case p.kind
             when 'percent' then p_price - round(p_price * p.value / 100.0)::integer
             else greatest(p_price - p.value, 0)
           end as price_cents,
           p.name as promotion_name
    from public.promotions p
    where (p.product_id = p_product_id or p.category_id = p_category_id)
      and public.promotion_is_live(p, p_local)
    union all
    select p_price, null
  ) x
  order by x.price_cents, x.promotion_name nulls last
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Cupons
-- ---------------------------------------------------------------------------
create type public.coupon_kind as enum ('percent', 'fixed', 'free_delivery');

create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9_-]{3,20}$'),
  description text check (char_length(description) <= 120),
  kind public.coupon_kind not null,
  -- percent: 1 a 100 (%); fixed: centavos; free_delivery: 0
  value integer not null default 0,
  min_order_cents integer not null default 0 check (min_order_cents >= 0),
  -- teto do desconto em cupons de porcentagem
  max_discount_cents integer check (max_discount_cents > 0),
  usage_limit integer check (usage_limit > 0),
  per_customer_limit integer check (per_customer_limit > 0),
  first_order_only boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (store_id, code),
  check (
    (kind = 'percent' and value between 1 and 100)
    or (kind = 'fixed' and value > 0)
    or (kind = 'free_delivery' and value = 0)
  ),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

alter table public.orders
  add column coupon_id uuid references public.coupons (id) on delete set null,
  add column coupon_code text;
create index orders_coupon_idx on public.orders (coupon_id) where coupon_id is not null;
create index orders_phone_idx on public.orders (store_id, customer_phone);

alter table public.order_items
  add column original_unit_price_cents integer,
  add column promotion_name text;

-- ---------------------------------------------------------------------------
-- Cálculo do pedido (usado pela prévia do checkout e pela gravação)
-- p_strict = true exige todos os dados do pedido; false serve para a prévia.
-- ---------------------------------------------------------------------------
create or replace function public.price_order(p_store_id uuid, p_order jsonb, p_strict boolean)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_store public.stores%rowtype;
  v_local timestamp := public.store_local_now();
  v_item jsonb;
  v_product public.products%rowtype;
  v_category public.categories%rowtype;
  v_size public.category_sizes%rowtype;
  v_zone public.delivery_zones%rowtype;
  v_coupon public.coupons%rowtype;
  v_promo record;
  v_qty integer;
  v_flavor_ids uuid[];
  v_flavor_names text[];
  v_flavor_count integer;
  v_raw_max integer;
  v_raw_avg numeric;
  v_promo_max integer;
  v_promo_avg numeric;
  v_promo_name text;
  v_option_ids uuid[];
  v_option_count integer;
  v_option_total integer;
  v_options jsonb;
  v_base integer;
  v_orig integer;
  v_unit integer;
  v_orig_unit integer;
  v_subtotal integer := 0;
  v_orig_subtotal integer := 0;
  v_fee integer := 0;
  v_discount integer := 0;
  v_total integer;
  v_items jsonb := '[]'::jsonb;
  v_fulfillment public.fulfillment_type;
  v_payment public.payment_method;
  v_change integer;
  v_phone text := regexp_replace(coalesce(p_order->>'customer_phone', ''), '\D', '', 'g');
  v_code text := upper(btrim(coalesce(p_order->>'coupon_code', '')));
  v_position integer := 0;
  v_used integer;
begin
  select * into v_store from public.stores where id = p_store_id;
  if not found then raise exception 'loja_nao_encontrada'; end if;

  begin
    v_fulfillment := coalesce((p_order->>'fulfillment')::public.fulfillment_type,
                              case when p_strict then null else 'delivery'::public.fulfillment_type end);
    v_payment := nullif(p_order->>'payment_method', '')::public.payment_method;
  exception when others then
    raise exception 'dados_invalidos';
  end;
  if v_fulfillment is null then raise exception 'dados_invalidos'; end if;
  if p_strict then
    if v_payment is null then raise exception 'dados_invalidos'; end if;
    -- Pix online chega na fase 4.
    if v_payment = 'pix_online' then raise exception 'pagamento_indisponivel'; end if;
  end if;

  -- ---- itens ----
  if jsonb_typeof(p_order->'items') is distinct from 'array'
     or jsonb_array_length(p_order->'items') = 0 then
    raise exception 'carrinho_vazio';
  end if;
  if jsonb_array_length(p_order->'items') > 60 then raise exception 'dados_invalidos'; end if;

  for v_item in select * from jsonb_array_elements(p_order->'items') loop
    v_position := v_position + 1;
    v_qty := coalesce((v_item->>'quantity')::integer, 1);
    if v_qty not between 1 and 50 then raise exception 'quantidade_invalida'; end if;

    select * into v_product from public.products
      where id = (v_item->>'product_id')::uuid and store_id = p_store_id and active;
    if not found then raise exception 'produto_indisponivel'; end if;
    select * into v_category from public.categories
      where id = v_product.category_id and active;
    if not found then raise exception 'produto_indisponivel'; end if;

    v_size := null;
    v_flavor_names := null;
    if v_category.has_sizes then
      select * into v_size from public.category_sizes
        where id = (v_item->>'size_id')::uuid and category_id = v_category.id;
      if not found then raise exception 'tamanho_invalido'; end if;

      v_flavor_ids := array(
        select distinct x::uuid
        from jsonb_array_elements_text(coalesce(v_item->'flavor_ids', '[]'::jsonb)) as x
        where x::uuid <> v_product.id
      );
      v_flavor_ids := array_prepend(v_product.id, v_flavor_ids);
      if cardinality(v_flavor_ids) > v_size.max_flavors then raise exception 'sabores_demais'; end if;

      -- cada sabor entra com o preço da promoção dele (se houver)
      select array_agg(p.name order by array_position(v_flavor_ids, p.id)),
             count(*), max(pp.price_cents), avg(pp.price_cents),
             max(pr.price_cents), avg(pr.price_cents), min(pr.promotion_name)
        into v_flavor_names, v_flavor_count, v_raw_max, v_raw_avg, v_promo_max, v_promo_avg, v_promo_name
      from public.products p
      join public.product_prices pp on pp.product_id = p.id and pp.size_id = v_size.id
      cross join lateral public.promo_price(p.id, p.category_id, pp.price_cents, v_local) pr
      where p.id = any (v_flavor_ids) and p.category_id = v_category.id and p.active;
      if v_flavor_count <> cardinality(v_flavor_ids) then raise exception 'sabor_indisponivel'; end if;

      if v_category.half_price_rule = 'average' then
        v_orig := ceil(v_raw_avg)::integer;
        v_base := ceil(v_promo_avg)::integer;
      else
        v_orig := v_raw_max;
        v_base := v_promo_max;
      end if;
      if v_flavor_count = 1 then v_flavor_names := null; end if;
    else
      if v_product.price_cents is null then raise exception 'produto_indisponivel'; end if;
      select * into v_promo
        from public.promo_price(v_product.id, v_product.category_id, v_product.price_cents, v_local);
      v_orig := v_product.price_cents;
      v_base := v_promo.price_cents;
      v_promo_name := v_promo.promotion_name;
    end if;

    -- adicionais (sem promoção)
    v_option_ids := array(
      select distinct x::uuid
      from jsonb_array_elements_text(coalesce(v_item->'option_ids', '[]'::jsonb)) as x
    );
    select count(*), coalesce(sum(o.price_cents), 0),
           coalesce(jsonb_agg(jsonb_build_object('group', g.name, 'name', o.name, 'price_cents', o.price_cents)
                              order by g.sort_order, o.sort_order), '[]'::jsonb)
      into v_option_count, v_option_total, v_options
    from public.options o
    join public.option_groups g on g.id = o.group_id
    where o.id = any (v_option_ids) and g.category_id = v_category.id and o.active;
    if v_option_count <> cardinality(v_option_ids) then raise exception 'adicional_indisponivel'; end if;

    if exists (
      select 1 from public.option_groups g
      where g.category_id = v_category.id
        and (select count(*) from public.options o where o.group_id = g.id and o.id = any (v_option_ids))
            not between g.min_select and g.max_select
    ) then
      raise exception 'adicionais_invalidos';
    end if;

    v_unit := v_base + v_option_total;
    v_orig_unit := v_orig + v_option_total;
    v_subtotal := v_subtotal + v_unit * v_qty;
    v_orig_subtotal := v_orig_subtotal + v_orig_unit * v_qty;

    v_items := v_items || jsonb_build_object(
      'product_id', v_product.id,
      'product_name', v_product.name,
      'size_name', v_size.name,
      'flavors', to_jsonb(v_flavor_names),
      'options', v_options,
      'quantity', v_qty,
      'unit_price_cents', v_unit,
      'original_unit_price_cents', case when v_orig_unit > v_unit then v_orig_unit end,
      'promotion_name', case when v_orig_unit > v_unit then v_promo_name end,
      'total_cents', v_unit * v_qty,
      'notes', nullif(btrim(left(coalesce(v_item->>'notes', ''), 200)), ''),
      'sort_order', v_position
    );
  end loop;

  if v_subtotal < v_store.min_order_cents then raise exception 'pedido_minimo'; end if;

  -- ---- entrega ----
  if v_fulfillment = 'delivery' then
    select * into v_zone from public.delivery_zones
      where id = nullif(p_order->>'delivery_zone_id', '')::uuid and store_id = p_store_id and active;
    if found then
      v_fee := v_zone.fee_cents;
    elsif p_strict then
      raise exception 'bairro_invalido';
    end if;
    if p_strict and (btrim(coalesce(p_order->>'address_street', '')) = ''
                     or btrim(coalesce(p_order->>'address_number', '')) = '') then
      raise exception 'endereco_invalido';
    end if;
  end if;

  -- ---- cupom ----
  if v_code <> '' then
    select * into v_coupon from public.coupons
      where store_id = p_store_id and code = v_code and active;
    if not found then raise exception 'cupom_invalido'; end if;
    if (v_coupon.starts_at is not null and now() < v_coupon.starts_at)
       or (v_coupon.ends_at is not null and now() >= v_coupon.ends_at) then
      raise exception 'cupom_expirado';
    end if;
    if v_coupon.usage_limit is not null then
      select count(*) into v_used from public.orders
        where coupon_id = v_coupon.id and status <> 'cancelled';
      if v_used >= v_coupon.usage_limit then raise exception 'cupom_esgotado'; end if;
    end if;
    if v_subtotal < v_coupon.min_order_cents then
      raise exception 'cupom_pedido_minimo' using detail = v_coupon.min_order_cents::text;
    end if;
    if char_length(v_phone) between 10 and 13 then
      if v_coupon.first_order_only and exists (
        select 1 from public.orders
        where store_id = p_store_id and customer_phone = v_phone and status <> 'cancelled'
      ) then
        raise exception 'cupom_primeiro_pedido';
      end if;
      if v_coupon.per_customer_limit is not null then
        select count(*) into v_used from public.orders
          where coupon_id = v_coupon.id and customer_phone = v_phone and status <> 'cancelled';
        if v_used >= v_coupon.per_customer_limit then raise exception 'cupom_ja_usado'; end if;
      end if;
    end if;

    v_discount := case v_coupon.kind
      when 'percent' then least(
        floor(v_subtotal * v_coupon.value / 100.0)::integer,
        coalesce(v_coupon.max_discount_cents, v_subtotal)
      )
      when 'fixed' then least(v_coupon.value, v_subtotal)
      else v_fee
    end;
    if v_coupon.kind = 'free_delivery' and v_fulfillment <> 'delivery' then
      raise exception 'cupom_so_entrega';
    end if;
  end if;

  v_total := greatest(v_subtotal + v_fee - v_discount, 0);

  -- ---- troco ----
  if p_strict and v_payment = 'cash' and nullif(p_order->>'change_for_cents', '') is not null then
    v_change := (p_order->>'change_for_cents')::integer;
    if v_change < v_total then raise exception 'troco_invalido'; end if;
  end if;

  return jsonb_build_object(
    'items', v_items,
    'subtotal_cents', v_subtotal,
    'original_subtotal_cents', v_orig_subtotal,
    'delivery_fee_cents', v_fee,
    'discount_cents', v_discount,
    'total_cents', v_total,
    'fulfillment', v_fulfillment,
    'payment_method', v_payment,
    'change_for_cents', v_change,
    'zone_id', v_zone.id,
    'zone_name', v_zone.neighborhood,
    'coupon_id', v_coupon.id,
    'coupon_code', v_coupon.code,
    'coupon_kind', v_coupon.kind,
    'coupon_value', v_coupon.value,
    'coupon_min_order_cents', v_coupon.min_order_cents,
    'coupon_max_discount_cents', v_coupon.max_discount_cents,
    'coupon_description', v_coupon.description
  );
end;
$$;

-- Prévia para o checkout: confere cupom e promoções sem gravar nada.
create or replace function public.quote_order(p_store_id uuid, p_order jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb := public.price_order(p_store_id, p_order, false);
begin
  return jsonb_build_object(
    'subtotal_cents', v->'subtotal_cents',
    'original_subtotal_cents', v->'original_subtotal_cents',
    'delivery_fee_cents', v->'delivery_fee_cents',
    'discount_cents', v->'discount_cents',
    'total_cents', v->'total_cents',
    'coupon_code', v->'coupon_code',
    'coupon_kind', v->'coupon_kind',
    'coupon_value', v->'coupon_value',
    'coupon_min_order_cents', v->'coupon_min_order_cents',
    'coupon_max_discount_cents', v->'coupon_max_discount_cents',
    'coupon_description', v->'coupon_description'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Gravar pedido (substitui a versão da fase 2)
-- ---------------------------------------------------------------------------
create or replace function public.place_order(p_store_id uuid, p_order jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_order->>'customer_name', ''));
  v_phone text := regexp_replace(coalesce(p_order->>'customer_phone', ''), '\D', '', 'g');
  v jsonb;
  v_delivery boolean;
  v_number integer;
  v_order public.orders%rowtype;
begin
  -- trava a loja: numera os pedidos em sequência e evita estourar o limite de um cupom
  perform 1 from public.stores where id = p_store_id for update;
  if not found then raise exception 'loja_nao_encontrada'; end if;
  if not public.is_store_open(p_store_id) then raise exception 'loja_fechada'; end if;

  if char_length(v_name) not between 2 and 80 then raise exception 'nome_invalido'; end if;
  if char_length(v_phone) not between 10 and 13 then raise exception 'telefone_invalido'; end if;

  v := public.price_order(p_store_id, p_order, true);
  v_delivery := v->>'fulfillment' = 'delivery';

  select coalesce(max(number), 0) + 1 into v_number from public.orders where store_id = p_store_id;

  insert into public.orders (
    store_id, number, fulfillment, customer_name, customer_phone,
    address_street, address_number, address_complement, address_district, address_reference,
    delivery_zone_id, subtotal_cents, delivery_fee_cents, discount_cents, total_cents,
    payment_method, change_for_cents, notes, coupon_id, coupon_code
  ) values (
    p_store_id, v_number, (v->>'fulfillment')::public.fulfillment_type, v_name, v_phone,
    case when v_delivery then left(btrim(p_order->>'address_street'), 120) end,
    case when v_delivery then left(btrim(p_order->>'address_number'), 20) end,
    case when v_delivery then nullif(left(btrim(coalesce(p_order->>'address_complement', '')), 80), '') end,
    case when v_delivery then v->>'zone_name' end,
    case when v_delivery then nullif(left(btrim(coalesce(p_order->>'address_reference', '')), 120), '') end,
    case when v_delivery then (v->>'zone_id')::uuid end,
    (v->>'subtotal_cents')::integer, (v->>'delivery_fee_cents')::integer,
    (v->>'discount_cents')::integer, (v->>'total_cents')::integer,
    (v->>'payment_method')::public.payment_method, (v->>'change_for_cents')::integer,
    nullif(left(btrim(coalesce(p_order->>'notes', '')), 300), ''),
    (v->>'coupon_id')::uuid, v->>'coupon_code'
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
                            'total_cents', v_order.total_cents);
end;
$$;

-- Acompanhamento do pedido agora mostra o cupom usado.
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
-- Importar cardápio lido da foto (depois da revisão do operador), tudo de uma vez.
-- p_menu = {"publish": true, "categories": [{name, description, has_sizes, sizes: [{name, max_flavors}],
--            groups: [{name, options: [{name, price_cents}]}],
--            products: [{name, description, price_cents, prices: [preço por tamanho, na ordem]}]}]}
-- ---------------------------------------------------------------------------
create or replace function public.import_menu(p_store_id uuid, p_menu jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_cat jsonb;
  v_prod jsonb;
  v_group jsonb;
  v_category_id uuid;
  v_size_ids uuid[];
  v_count integer := 0;
begin
  if not public.is_store_member(p_store_id) then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  if jsonb_typeof(p_menu->'categories') is distinct from 'array'
     or jsonb_array_length(p_menu->'categories') = 0 then
    raise exception 'cardapio_vazio';
  end if;

  for v_cat in select * from jsonb_array_elements(p_menu->'categories') loop
    v_category_id := public.save_category(p_store_id, jsonb_build_object(
      'name', v_cat->>'name',
      'description', v_cat->>'description',
      'has_sizes', coalesce((v_cat->>'has_sizes')::boolean, false),
      'half_price_rule', 'highest',
      -- publish = false: entra pausada para o operador conferir com calma
      'active', coalesce((p_menu->>'publish')::boolean, true),
      'sizes', case when coalesce((v_cat->>'has_sizes')::boolean, false)
                    then coalesce(v_cat->'sizes', '[]'::jsonb) else '[]'::jsonb end,
      'groups', coalesce((
        select jsonb_agg(jsonb_build_object(
          'name', g->>'name',
          'min_select', 0,
          'max_select', greatest(jsonb_array_length(coalesce(g->'options', '[]'::jsonb)), 1),
          'options', coalesce(g->'options', '[]'::jsonb)
        ))
        from jsonb_array_elements(coalesce(v_cat->'groups', '[]'::jsonb)) g
        where jsonb_array_length(coalesce(g->'options', '[]'::jsonb)) > 0
      ), '[]'::jsonb)
    ));

    v_size_ids := array(
      select id from public.category_sizes where category_id = v_category_id order by sort_order
    );

    for v_prod in select * from jsonb_array_elements(coalesce(v_cat->'products', '[]'::jsonb)) loop
      perform public.save_product(p_store_id, jsonb_build_object(
        'category_id', v_category_id,
        'name', v_prod->>'name',
        'description', v_prod->>'description',
        'active', true,
        'price_cents', case when cardinality(v_size_ids) = 0 then v_prod->'price_cents' end,
        'prices', coalesce((
          select jsonb_agg(jsonb_build_object('size_id', v_size_ids[x.n], 'price_cents', x.price))
          from jsonb_array_elements_text(coalesce(v_prod->'prices', '[]'::jsonb))
               with ordinality as x(price, n)
          where x.n <= cardinality(v_size_ids) and nullif(x.price, 'null') is not null
        ), '[]'::jsonb)
      ));
      v_count := v_count + 1;
    end loop;
  end loop;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Acesso
-- ---------------------------------------------------------------------------
alter table public.promotions enable row level security;
alter table public.coupons enable row level security;

-- Promoções aparecem no site (preço riscado); só a equipe vê as pausadas.
create policy "promoções visíveis" on public.promotions for select
  using (active or public.is_store_member(store_id));
create policy "membros gerenciam promoções" on public.promotions for all to authenticated
  using (public.is_store_member(store_id))
  with check (
    public.is_store_member(store_id)
    and (product_id is null or exists (
      select 1 from public.products p where p.id = product_id and p.store_id = promotions.store_id))
    and (category_id is null or exists (
      select 1 from public.categories c where c.id = category_id and c.store_id = promotions.store_id))
  );

-- Cupons são segredo da loja: o cliente só consegue testar um código pelo checkout.
create policy "membros gerenciam cupons" on public.coupons for all to authenticated
  using (public.is_store_member(store_id))
  with check (public.is_store_member(store_id));
revoke all on public.coupons from anon;

revoke execute on function public.price_order(uuid, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.quote_order(uuid, jsonb) to anon, authenticated;
grant execute on function public.place_order(uuid, jsonb) to anon, authenticated;
grant execute on function public.get_public_order(uuid) to anon, authenticated;
revoke execute on function public.import_menu(uuid, jsonb) from public, anon;
grant execute on function public.import_menu(uuid, jsonb) to authenticated;
