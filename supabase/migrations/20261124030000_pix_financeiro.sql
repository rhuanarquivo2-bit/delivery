-- Fase 4: Pix online (Mercado Pago ou Asaas, na conta de cada loja) e financeiro.

-- ---------------------------------------------------------------------------
-- Pagamento online no pedido
-- ---------------------------------------------------------------------------
-- on_delivery: paga na entrega (como até a fase 3)
-- awaiting: Pix gerado, esperando o cliente pagar (o pedido ainda não aparece para a cozinha)
-- paid: pago online; expired: o prazo do Pix acabou sem pagamento
create type public.payment_status as enum ('on_delivery', 'awaiting', 'paid', 'expired');

alter table public.orders
  add column payment_status public.payment_status not null default 'on_delivery',
  add column paid_at timestamptz;
create index orders_awaiting_idx on public.orders (store_id) where payment_status = 'awaiting';

-- Qual conta de recebimento a loja conectou (null = sem Pix online). O site usa para mostrar a
-- opção e para saber se precisa pedir CPF (o Asaas exige).
alter table public.stores add column pix_provider text check (pix_provider in ('mercadopago', 'asaas'));

-- CPF/CNPJ do cliente (só quando a cobrança exige, ex.: Asaas).
alter table public.orders add column customer_document text check (customer_document ~ '^(\d{11}|\d{14})$');

-- Cobrança Pix de cada pedido (uma por pedido).
create table public.order_payments (
  order_id uuid primary key references public.orders (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete cascade,
  provider text not null check (provider in ('mercadopago', 'asaas')),
  external_id text not null,
  amount_cents integer not null check (amount_cents > 0),
  qr_code text not null,
  qr_base64 text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (provider, external_id)
);

-- Conta de recebimento da loja. O token é secreto: só o servidor lê (chave de serviço);
-- o painel só vê se está conectado e o nome da conta.
create table public.store_payment_accounts (
  store_id uuid primary key references public.stores (id) on delete cascade,
  provider text not null check (provider in ('mercadopago', 'asaas')),
  access_token text not null,
  -- Asaas: token que o webhook manda de volta, para conferirmos a origem
  webhook_token text,
  account_label text,
  live_mode boolean not null default true,
  connected_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Funções de pedido (substituem as da fase 3)
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
    -- Pix online só quando a loja conectou uma conta de recebimento.
    if v_payment = 'pix_online' and v_store.pix_provider is null then
      raise exception 'pagamento_indisponivel';
    end if;
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

create or replace function public.place_order(p_store_id uuid, p_order jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_order->>'customer_name', ''));
  v_phone text := regexp_replace(coalesce(p_order->>'customer_phone', ''), '\D', '', 'g');
  v_document text := nullif(regexp_replace(coalesce(p_order->>'customer_document', ''), '\D', '', 'g'), '');
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
  if v_document is not null and char_length(v_document) not in (11, 14) then raise exception 'documento_invalido'; end if;
  if p_order->>'payment_method' = 'pix_online' and v_document is null
     and (select pix_provider from public.stores where id = p_store_id) = 'asaas' then
    raise exception 'documento_obrigatorio';
  end if;

  v := public.price_order(p_store_id, p_order, true);
  v_delivery := v->>'fulfillment' = 'delivery';

  select coalesce(max(number), 0) + 1 into v_number from public.orders where store_id = p_store_id;

  insert into public.orders (
    store_id, number, fulfillment, customer_name, customer_phone,
    address_street, address_number, address_complement, address_district, address_reference,
    delivery_zone_id, subtotal_cents, delivery_fee_cents, discount_cents, total_cents,
    payment_method, change_for_cents, notes, coupon_id, coupon_code, payment_status, customer_document
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
    (v->>'coupon_id')::uuid, v->>'coupon_code',
    case when v->>'payment_method' = 'pix_online' then 'awaiting' else 'on_delivery' end::public.payment_status,
    v_document
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

-- Marca o Pix como pago. Só o servidor (chave de serviço) chama, depois de conferir
-- o pagamento direto na API do Mercado Pago.
create or replace function public.mark_order_paid(p_order_id uuid, p_external_id text, p_amount_cents integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.order_payments%rowtype;
begin
  select * into v_payment from public.order_payments
    where order_id = p_order_id and external_id = p_external_id for update;
  if not found then return false; end if;
  if p_amount_cents < v_payment.amount_cents then return false; end if;

  update public.orders
    set payment_status = 'paid', paid_at = now(),
        -- pagou depois de expirar (raro): o pedido volta a valer
        status = case when status = 'cancelled' and payment_status = 'expired' then 'pending' else status end,
        cancel_reason = case when status = 'cancelled' and payment_status = 'expired' then null else cancel_reason end,
        cancelled_at = case when status = 'cancelled' and payment_status = 'expired' then null else cancelled_at end
    where id = p_order_id and payment_status in ('awaiting', 'expired');
  return true;
end;
$$;

-- Pix não pago no prazo: o pedido é cancelado e o cupom volta a ficar livre.
create or replace function public.expire_order_payment(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.orders
    set payment_status = 'expired', status = 'cancelled', cancel_reason = 'Pix não foi pago no prazo'
    where id = p_order_id and payment_status = 'awaiting'
      and exists (select 1 from public.order_payments p where p.order_id = p_order_id and p.expires_at <= now());
  return found;
end;
$$;

-- ---------------------------------------------------------------------------
-- Financeiro
-- Considera só pedidos de verdade: Pix não pago (awaiting/expired) fica de fora.
-- Datas no horário de Brasília; p_from e p_to são dias (inclusive).
-- ---------------------------------------------------------------------------
create or replace function public.finance_report(p_store_id uuid, p_from date, p_to date)
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
    select o.*, (o.created_at at time zone 'America/Sao_Paulo')::date as dia
    from public.orders o
    where o.store_id = p_store_id
      and o.created_at >= v_start and o.created_at < v_end
      and o.payment_status in ('on_delivery', 'paid')
  ),
  ok as (select * from base where status <> 'cancelled')
  select jsonb_build_object(
    'orders', (select count(*) from ok),
    'gross_cents', (select coalesce(sum(total_cents), 0) from ok),
    'subtotal_cents', (select coalesce(sum(subtotal_cents), 0) from ok),
    'delivery_fee_cents', (select coalesce(sum(delivery_fee_cents), 0) from ok),
    'discount_cents', (select coalesce(sum(discount_cents), 0) from ok),
    'delivery_orders', (select count(*) from ok where fulfillment = 'delivery'),
    'pickup_orders', (select count(*) from ok where fulfillment = 'pickup'),
    'cancelled_orders', (select count(*) from base where status = 'cancelled'),
    'cancelled_cents', (select coalesce(sum(total_cents), 0) from base where status = 'cancelled'),
    'open_orders', (select count(*) from ok where status not in ('delivered')),
    'cash_change_cents', (
      select coalesce(sum(change_for_cents - total_cents), 0) from ok
      where payment_method = 'cash' and change_for_cents > total_cents
    ),
    'by_method', (
      select coalesce(jsonb_object_agg(m.method, jsonb_build_object('orders', m.n, 'cents', m.cents)), '{}'::jsonb)
      from (select payment_method::text as method, count(*) as n, sum(total_cents) as cents from ok group by 1) m
    ),
    'by_day', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d.dia, 'orders', d.n, 'cents', d.cents) order by d.dia), '[]'::jsonb)
      from (select dia, count(*) as n, sum(total_cents) as cents from ok group by dia) d
    ),
    'top_products', (
      select coalesce(jsonb_agg(jsonb_build_object('name', t.product_name, 'quantity', t.qty, 'cents', t.cents)
                                order by t.cents desc), '[]'::jsonb)
      from (
        select i.product_name, sum(i.quantity) as qty, sum(i.total_cents) as cents
        from public.order_items i join ok on ok.id = i.order_id
        group by i.product_name
        order by sum(i.total_cents) desc
        limit 8
      ) t
    ),
    'coupons', (
      select coalesce(jsonb_agg(jsonb_build_object('code', c.coupon_code, 'orders', c.n, 'cents', c.cents)
                                order by c.n desc), '[]'::jsonb)
      from (select coupon_code, count(*) as n, sum(discount_cents) as cents from ok
            where coupon_code is not null group by coupon_code) c
    )
  ) into v;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Acesso
-- ---------------------------------------------------------------------------
alter table public.order_payments enable row level security;
alter table public.store_payment_accounts enable row level security;

-- A equipe vê as cobranças (sem precisar do QR Code); o cliente vê pelo get_public_order.
create policy "equipe vê cobranças" on public.order_payments for select to authenticated
  using (public.is_store_member(store_id));
revoke insert, update, delete on public.order_payments from anon, authenticated;

-- Ninguém lê nem grava a conta de recebimento pelo navegador: só o servidor, com a chave de serviço.
revoke all on public.store_payment_accounts from anon, authenticated;

-- A loja não pode se declarar apta a receber Pix online sem conta conectada:
-- pix_provider só muda pelo servidor (chave de serviço), junto com a conta.
create or replace function public.guard_pix_provider()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated')
     and new.pix_provider is distinct from (case when tg_op = 'UPDATE' then old.pix_provider end) then
    raise exception 'pix_provider só pode ser alterado pelo servidor' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger stores_guard_pix_provider
  before insert or update on public.stores
  for each row execute function public.guard_pix_provider();

revoke execute on function public.price_order(uuid, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.place_order(uuid, jsonb) to anon, authenticated;
grant execute on function public.get_public_order(uuid) to anon, authenticated;
revoke execute on function public.mark_order_paid(uuid, text, integer) from public, anon, authenticated;
revoke execute on function public.expire_order_payment(uuid) from public, anon, authenticated;
revoke execute on function public.finance_report(uuid, date, date) from public, anon;
grant execute on function public.finance_report(uuid, date, date) to authenticated;
