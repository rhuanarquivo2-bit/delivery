-- Fase 2: Cardápio e pedidos
-- Categorias (com tamanhos opcionais e pizza de vários sabores), produtos, adicionais,
-- pedidos com pagamento na entrega e troco.

-- ---------------------------------------------------------------------------
-- Cardápio
-- ---------------------------------------------------------------------------
create type public.half_price_rule as enum ('highest', 'average');

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  description text check (char_length(description) <= 200),
  -- true = os produtos têm preço por tamanho (ex.: pizzas Broto/Média/Grande)
  has_sizes boolean not null default false,
  -- como cobrar pizza com mais de um sabor: pelo sabor mais caro ou pela média
  half_price_rule public.half_price_rule not null default 'highest',
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index categories_store_idx on public.categories (store_id, sort_order);

create table public.category_sizes (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 30),
  -- quantos sabores cabem nesse tamanho (1 = inteira, 2 = meio a meio...)
  max_flavors smallint not null default 1 check (max_flavors between 1 and 4),
  sort_order integer not null default 0
);
create index category_sizes_category_idx on public.category_sizes (category_id, sort_order);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text check (char_length(description) <= 400),
  image_url text,
  -- preço único (categorias sem tamanho). Nas categorias com tamanho, ver product_prices.
  price_cents integer check (price_cents >= 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index products_category_idx on public.products (category_id, sort_order);
create index products_store_idx on public.products (store_id);

create table public.product_prices (
  product_id uuid not null references public.products (id) on delete cascade,
  size_id uuid not null references public.category_sizes (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete cascade,
  price_cents integer not null check (price_cents >= 0),
  primary key (product_id, size_id)
);

-- Grupos de adicionais por categoria (ex.: "Borda", "Adicionais", "Ponto da carne").
create table public.option_groups (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  min_select smallint not null default 0 check (min_select >= 0),
  max_select smallint not null default 1 check (max_select >= 1),
  sort_order integer not null default 0,
  check (min_select <= max_select)
);
create index option_groups_category_idx on public.option_groups (category_id, sort_order);

create table public.options (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  group_id uuid not null references public.option_groups (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  price_cents integer not null default 0 check (price_cents >= 0),
  active boolean not null default true,
  sort_order integer not null default 0
);
create index options_group_idx on public.options (group_id, sort_order);

-- ---------------------------------------------------------------------------
-- Pedidos
-- ---------------------------------------------------------------------------
create type public.order_status as enum (
  'pending',          -- novo, aguardando a loja aceitar
  'preparing',        -- aceito, em preparo
  'ready',            -- pronto (aguardando motoboy ou retirada)
  'out_for_delivery', -- saiu para entrega
  'delivered',        -- entregue / retirado
  'cancelled'
);
create type public.fulfillment_type as enum ('delivery', 'pickup');
create type public.payment_method as enum ('pix_online', 'pix_delivery', 'card_delivery', 'cash');

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  number integer not null,
  -- link de acompanhamento enviado ao cliente
  public_token uuid not null unique default gen_random_uuid(),
  status public.order_status not null default 'pending',
  fulfillment public.fulfillment_type not null,
  customer_name text not null,
  customer_phone text not null,
  address_street text,
  address_number text,
  address_complement text,
  address_district text,
  address_reference text,
  delivery_zone_id uuid references public.delivery_zones (id) on delete set null,
  subtotal_cents integer not null check (subtotal_cents >= 0),
  delivery_fee_cents integer not null default 0 check (delivery_fee_cents >= 0),
  discount_cents integer not null default 0 check (discount_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  payment_method public.payment_method not null,
  -- dinheiro: "troco para quanto". null = não precisa de troco
  change_for_cents integer check (change_for_cents >= 0),
  notes text,
  cancel_reason text,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  ready_at timestamptz,
  dispatched_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  unique (store_id, number)
);
create index orders_store_created_idx on public.orders (store_id, created_at desc);
create index orders_store_status_idx on public.orders (store_id, status);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  -- cópia do cardápio no momento do pedido (o cardápio pode mudar depois)
  product_name text not null,
  size_name text,
  flavors text[],
  options jsonb not null default '[]',
  quantity integer not null check (quantity between 1 and 50),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  notes text,
  sort_order integer not null default 0
);
create index order_items_order_idx on public.order_items (order_id, sort_order);

-- Registra o horário de cada mudança de status.
create or replace function public.track_order_status()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    case new.status
      when 'preparing' then new.accepted_at := coalesce(new.accepted_at, now());
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

create trigger orders_track_status
  before update on public.orders
  for each row execute function public.track_order_status();

-- ---------------------------------------------------------------------------
-- Loja aberta agora? (fuso de São Paulo; horários que passam da meia-noite)
-- Mesma regra de src/lib/hours.ts.
-- ---------------------------------------------------------------------------
create or replace function public.is_store_open(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with agora as (
    select extract(dow from (now() at time zone 'America/Sao_Paulo'))::int as dia,
           (now() at time zone 'America/Sao_Paulo')::time as hora
  )
  select coalesce(
    (select open_override from public.stores where id = p_store_id),
    exists (
      select 1
      from public.store_hours h, agora a
      where h.store_id = p_store_id
        and (
          (h.weekday = a.dia and (
            (h.closes_at > h.opens_at and a.hora >= h.opens_at and a.hora < h.closes_at)
            or (h.closes_at <= h.opens_at and a.hora >= h.opens_at)
          ))
          or (h.weekday = (a.dia + 6) % 7 and h.closes_at <= h.opens_at and a.hora < h.closes_at)
        )
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- Fazer pedido (site do cliente, sem login).
-- Os preços são SEMPRE recalculados aqui a partir do cardápio; o valor enviado pelo
-- navegador é ignorado. Erros saem com mensagens-código tratadas pelo app.
--
-- p_order: {
--   fulfillment: 'delivery' | 'pickup',
--   customer_name, customer_phone,
--   address_street, address_number, address_complement, address_reference, delivery_zone_id,
--   payment_method, change_for_cents, notes,
--   items: [{ product_id, size_id, flavor_ids: [], option_ids: [], quantity, notes }]
-- }
-- ---------------------------------------------------------------------------
create or replace function public.place_order(p_store_id uuid, p_order jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store public.stores%rowtype;
  v_item jsonb;
  v_product public.products%rowtype;
  v_category public.categories%rowtype;
  v_size public.category_sizes%rowtype;
  v_zone public.delivery_zones%rowtype;
  v_qty integer;
  v_flavor_ids uuid[];
  v_flavor_names text[];
  v_flavor_count integer;
  v_flavor_max integer;
  v_flavor_avg numeric;
  v_option_ids uuid[];
  v_option_count integer;
  v_option_total integer;
  v_options jsonb;
  v_base integer;
  v_unit integer;
  v_subtotal integer := 0;
  v_fee integer := 0;
  v_total integer;
  v_items jsonb := '[]'::jsonb;
  v_fulfillment public.fulfillment_type;
  v_payment public.payment_method;
  v_change integer;
  v_name text := btrim(coalesce(p_order->>'customer_name', ''));
  v_phone text := regexp_replace(coalesce(p_order->>'customer_phone', ''), '\D', '', 'g');
  v_number integer;
  v_order public.orders%rowtype;
  v_position integer := 0;
begin
  -- trava a loja para numerar os pedidos em sequência sem repetir
  select * into v_store from public.stores where id = p_store_id for update;
  if not found then raise exception 'loja_nao_encontrada'; end if;
  if not public.is_store_open(p_store_id) then raise exception 'loja_fechada'; end if;

  if char_length(v_name) not between 2 and 80 then raise exception 'nome_invalido'; end if;
  if char_length(v_phone) not between 10 and 13 then raise exception 'telefone_invalido'; end if;

  begin
    v_fulfillment := (p_order->>'fulfillment')::public.fulfillment_type;
    v_payment := (p_order->>'payment_method')::public.payment_method;
  exception when others then
    raise exception 'dados_invalidos';
  end;
  if v_fulfillment is null or v_payment is null then raise exception 'dados_invalidos'; end if;
  -- Pix online chega na fase 4.
  if v_payment = 'pix_online' then raise exception 'pagamento_indisponivel'; end if;

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

      select array_agg(p.name order by array_position(v_flavor_ids, p.id)),
             count(*), max(pp.price_cents), avg(pp.price_cents)
        into v_flavor_names, v_flavor_count, v_flavor_max, v_flavor_avg
      from public.products p
      join public.product_prices pp on pp.product_id = p.id and pp.size_id = v_size.id
      where p.id = any (v_flavor_ids) and p.category_id = v_category.id and p.active;
      if v_flavor_count <> cardinality(v_flavor_ids) then raise exception 'sabor_indisponivel'; end if;

      v_base := case v_category.half_price_rule
        when 'average' then ceil(v_flavor_avg)::integer
        else v_flavor_max
      end;
      if v_flavor_count = 1 then v_flavor_names := null; end if;
    else
      if v_product.price_cents is null then raise exception 'produto_indisponivel'; end if;
      v_base := v_product.price_cents;
    end if;

    -- adicionais
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
    v_subtotal := v_subtotal + v_unit * v_qty;

    v_items := v_items || jsonb_build_object(
      'product_id', v_product.id,
      'product_name', v_product.name,
      'size_name', v_size.name,
      'flavors', to_jsonb(v_flavor_names),
      'options', v_options,
      'quantity', v_qty,
      'unit_price_cents', v_unit,
      'total_cents', v_unit * v_qty,
      'notes', nullif(btrim(left(coalesce(v_item->>'notes', ''), 200)), ''),
      'sort_order', v_position
    );
  end loop;

  if v_subtotal < v_store.min_order_cents then raise exception 'pedido_minimo'; end if;

  -- ---- entrega ----
  if v_fulfillment = 'delivery' then
    select * into v_zone from public.delivery_zones
      where id = (p_order->>'delivery_zone_id')::uuid and store_id = p_store_id and active;
    if not found then raise exception 'bairro_invalido'; end if;
    if btrim(coalesce(p_order->>'address_street', '')) = ''
       or btrim(coalesce(p_order->>'address_number', '')) = '' then
      raise exception 'endereco_invalido';
    end if;
    v_fee := v_zone.fee_cents;
  end if;

  v_total := v_subtotal + v_fee;

  -- ---- troco ----
  if v_payment = 'cash' and nullif(p_order->>'change_for_cents', '') is not null then
    v_change := (p_order->>'change_for_cents')::integer;
    if v_change < v_total then raise exception 'troco_invalido'; end if;
  end if;

  select coalesce(max(number), 0) + 1 into v_number from public.orders where store_id = p_store_id;

  insert into public.orders (
    store_id, number, fulfillment, customer_name, customer_phone,
    address_street, address_number, address_complement, address_district, address_reference,
    delivery_zone_id, subtotal_cents, delivery_fee_cents, total_cents,
    payment_method, change_for_cents, notes
  ) values (
    p_store_id, v_number, v_fulfillment, v_name, v_phone,
    case when v_fulfillment = 'delivery' then left(btrim(p_order->>'address_street'), 120) end,
    case when v_fulfillment = 'delivery' then left(btrim(p_order->>'address_number'), 20) end,
    case when v_fulfillment = 'delivery' then nullif(left(btrim(coalesce(p_order->>'address_complement', '')), 80), '') end,
    case when v_fulfillment = 'delivery' then v_zone.neighborhood end,
    case when v_fulfillment = 'delivery' then nullif(left(btrim(coalesce(p_order->>'address_reference', '')), 120), '') end,
    case when v_fulfillment = 'delivery' then v_zone.id end,
    v_subtotal, v_fee, v_total,
    v_payment, v_change, nullif(left(btrim(coalesce(p_order->>'notes', '')), 300), '')
  ) returning * into v_order;

  insert into public.order_items (
    order_id, store_id, product_id, product_name, size_name, flavors, options,
    quantity, unit_price_cents, total_cents, notes, sort_order
  )
  select v_order.id, p_store_id, i.product_id, i.product_name, i.size_name,
         (select array_agg(f) from jsonb_array_elements_text(i.flavors) f),
         i.options, i.quantity, i.unit_price_cents, i.total_cents, i.notes, i.sort_order
  from jsonb_to_recordset(v_items) as i(
    product_id uuid, product_name text, size_name text, flavors jsonb, options jsonb,
    quantity integer, unit_price_cents integer, total_cents integer, notes text, sort_order integer
  );

  return jsonb_build_object('id', v_order.id, 'number', v_order.number, 'token', v_order.public_token,
                            'total_cents', v_order.total_cents);
end;
$$;

-- Acompanhamento do pedido pelo cliente (só com o link secreto).
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
        'options', i.options, 'quantity', i.quantity, 'total_cents', i.total_cents, 'notes', i.notes
      ) order by i.sort_order)
      from public.order_items i where i.order_id = o.id
    ), '[]'::jsonb)
  )
  from public.orders o
  join public.stores s on s.id = o.store_id
  where o.public_token = p_token;
$$;

-- ---------------------------------------------------------------------------
-- Salvar categoria com tamanhos e adicionais de uma vez (painel).
-- Itens com id são atualizados, sem id são criados, os que sumiram são apagados.
-- ---------------------------------------------------------------------------
create or replace function public.save_category(p_store_id uuid, p_category jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid := nullif(p_category->>'id', '')::uuid;
  v_size jsonb;
  v_group jsonb;
  v_option jsonb;
  v_group_id uuid;
  v_keep_sizes uuid[] := '{}';
  v_keep_groups uuid[] := '{}';
  v_keep_options uuid[];
  v_child uuid;
  v_i integer;
  v_j integer;
begin
  if not public.is_store_member(p_store_id) then
    raise exception 'sem permissão' using errcode = '42501';
  end if;

  if v_id is null then
    insert into public.categories (store_id, name, description, has_sizes, half_price_rule, active, sort_order)
    values (
      p_store_id, btrim(p_category->>'name'), nullif(btrim(coalesce(p_category->>'description', '')), ''),
      coalesce((p_category->>'has_sizes')::boolean, false),
      coalesce((p_category->>'half_price_rule')::public.half_price_rule, 'highest'),
      coalesce((p_category->>'active')::boolean, true),
      coalesce((select max(sort_order) + 1 from public.categories where store_id = p_store_id), 0)
    ) returning id into v_id;
  else
    update public.categories set
      name = btrim(p_category->>'name'),
      description = nullif(btrim(coalesce(p_category->>'description', '')), ''),
      has_sizes = coalesce((p_category->>'has_sizes')::boolean, false),
      half_price_rule = coalesce((p_category->>'half_price_rule')::public.half_price_rule, 'highest'),
      active = coalesce((p_category->>'active')::boolean, true)
    where id = v_id and store_id = p_store_id;
    if not found then raise exception 'categoria_nao_encontrada'; end if;
  end if;

  -- tamanhos
  v_i := 0;
  for v_size in select * from jsonb_array_elements(coalesce(p_category->'sizes', '[]'::jsonb)) loop
    v_child := nullif(v_size->>'id', '')::uuid;
    if v_child is not null then
      update public.category_sizes
        set name = btrim(v_size->>'name'), max_flavors = (v_size->>'max_flavors')::smallint, sort_order = v_i
        where id = v_child and category_id = v_id;
      if not found then v_child := null; end if;
    end if;
    if v_child is null then
      insert into public.category_sizes (store_id, category_id, name, max_flavors, sort_order)
      values (p_store_id, v_id, btrim(v_size->>'name'), (v_size->>'max_flavors')::smallint, v_i)
      returning id into v_child;
    end if;
    v_keep_sizes := v_keep_sizes || v_child;
    v_i := v_i + 1;
  end loop;
  delete from public.category_sizes where category_id = v_id and not (id = any (v_keep_sizes));

  -- grupos de adicionais
  v_i := 0;
  for v_group in select * from jsonb_array_elements(coalesce(p_category->'groups', '[]'::jsonb)) loop
    v_group_id := nullif(v_group->>'id', '')::uuid;
    if v_group_id is not null then
      update public.option_groups set
        name = btrim(v_group->>'name'),
        min_select = (v_group->>'min_select')::smallint,
        max_select = (v_group->>'max_select')::smallint,
        sort_order = v_i
      where id = v_group_id and category_id = v_id;
      if not found then v_group_id := null; end if;
    end if;
    if v_group_id is null then
      insert into public.option_groups (store_id, category_id, name, min_select, max_select, sort_order)
      values (p_store_id, v_id, btrim(v_group->>'name'), (v_group->>'min_select')::smallint,
              (v_group->>'max_select')::smallint, v_i)
      returning id into v_group_id;
    end if;
    v_keep_groups := v_keep_groups || v_group_id;

    v_keep_options := '{}';
    v_j := 0;
    for v_option in select * from jsonb_array_elements(coalesce(v_group->'options', '[]'::jsonb)) loop
      v_child := nullif(v_option->>'id', '')::uuid;
      if v_child is not null then
        update public.options set
          name = btrim(v_option->>'name'),
          price_cents = (v_option->>'price_cents')::integer,
          active = coalesce((v_option->>'active')::boolean, true),
          sort_order = v_j
        where id = v_child and group_id = v_group_id;
        if not found then v_child := null; end if;
      end if;
      if v_child is null then
        insert into public.options (store_id, group_id, name, price_cents, active, sort_order)
        values (p_store_id, v_group_id, btrim(v_option->>'name'), (v_option->>'price_cents')::integer,
                coalesce((v_option->>'active')::boolean, true), v_j)
        returning id into v_child;
      end if;
      v_keep_options := v_keep_options || v_child;
      v_j := v_j + 1;
    end loop;
    delete from public.options where group_id = v_group_id and not (id = any (v_keep_options));
    v_i := v_i + 1;
  end loop;
  delete from public.option_groups where category_id = v_id and not (id = any (v_keep_groups));

  return v_id;
end;
$$;

-- Salvar produto com preços por tamanho de uma vez (painel).
create or replace function public.save_product(p_store_id uuid, p_product jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid := nullif(p_product->>'id', '')::uuid;
  v_category uuid := (p_product->>'category_id')::uuid;
begin
  if not public.is_store_member(p_store_id) then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  if not exists (select 1 from public.categories where id = v_category and store_id = p_store_id) then
    raise exception 'categoria_nao_encontrada';
  end if;

  if v_id is null then
    insert into public.products (store_id, category_id, name, description, image_url, price_cents, active, sort_order)
    values (
      p_store_id, v_category, btrim(p_product->>'name'),
      nullif(btrim(coalesce(p_product->>'description', '')), ''),
      nullif(p_product->>'image_url', ''),
      nullif(p_product->>'price_cents', '')::integer,
      coalesce((p_product->>'active')::boolean, true),
      coalesce((select max(sort_order) + 1 from public.products where category_id = v_category), 0)
    ) returning id into v_id;
  else
    update public.products set
      category_id = v_category,
      name = btrim(p_product->>'name'),
      description = nullif(btrim(coalesce(p_product->>'description', '')), ''),
      image_url = nullif(p_product->>'image_url', ''),
      price_cents = nullif(p_product->>'price_cents', '')::integer,
      active = coalesce((p_product->>'active')::boolean, true)
    where id = v_id and store_id = p_store_id;
    if not found then raise exception 'produto_nao_encontrado'; end if;
  end if;

  delete from public.product_prices where product_id = v_id;
  insert into public.product_prices (product_id, size_id, store_id, price_cents)
  select v_id, s.id, p_store_id, (x->>'price_cents')::integer
  from jsonb_array_elements(coalesce(p_product->'prices', '[]'::jsonb)) as x
  join public.category_sizes s on s.id = (x->>'size_id')::uuid and s.category_id = v_category
  where nullif(x->>'price_cents', '') is not null;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Regras de acesso
-- ---------------------------------------------------------------------------
alter table public.categories enable row level security;
alter table public.category_sizes enable row level security;
alter table public.products enable row level security;
alter table public.product_prices enable row level security;
alter table public.option_groups enable row level security;
alter table public.options enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- Cardápio: leitura pública (o site mostra), escrita pelos membros da loja.
create policy "cardápio visível" on public.categories for select using (true);
create policy "membros gerenciam categorias" on public.categories for all to authenticated
  using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));

create policy "tamanhos visíveis" on public.category_sizes for select using (true);
create policy "membros gerenciam tamanhos" on public.category_sizes for all to authenticated
  using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));

create policy "produtos visíveis" on public.products for select using (true);
create policy "membros gerenciam produtos" on public.products for all to authenticated
  using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));

create policy "preços visíveis" on public.product_prices for select using (true);
create policy "membros gerenciam preços" on public.product_prices for all to authenticated
  using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));

create policy "grupos visíveis" on public.option_groups for select using (true);
create policy "membros gerenciam grupos" on public.option_groups for all to authenticated
  using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));

create policy "adicionais visíveis" on public.options for select using (true);
create policy "membros gerenciam adicionais" on public.options for all to authenticated
  using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));

-- Pedidos: só a equipe da loja vê. Clientes criam pelo place_order e acompanham pelo
-- get_public_order. A equipe só pode mudar o status (os valores não mudam).
create policy "equipe vê pedidos" on public.orders for select to authenticated
  using (public.is_store_member(store_id));
create policy "equipe muda status" on public.orders for update to authenticated
  using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));
revoke insert, update, delete on public.orders from anon, authenticated;
grant update (status, cancel_reason) on public.orders to authenticated;

create policy "equipe vê itens" on public.order_items for select to authenticated
  using (public.is_store_member(store_id));
revoke insert, update, delete on public.order_items from anon, authenticated;

grant execute on function public.place_order(uuid, jsonb) to anon, authenticated;
grant execute on function public.get_public_order(uuid) to anon, authenticated;

-- Pedidos ao vivo no painel (Supabase Realtime).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.orders;
  end if;
end;
$$;
