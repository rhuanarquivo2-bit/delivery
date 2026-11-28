-- Fase 19: escolhas por produto (ex.: "Refrigerante Lata" com o sabor à escolha).
-- Pode rodar mais de uma vez sem problema (tudo é "se não existir" / "substitui").
--
-- Até aqui os grupos de adicionais valiam para a categoria inteira. Agora um grupo pode ser
-- de um produto só (option_groups.product_id). Assim a loja cadastra "Refrigerante 2L" uma vez,
-- com o grupo "Sabor" obrigatório (Coca-Cola, Fanta, Guaraná...), e pausa o sabor que acabou.
--
-- 1. Coluna product_id em option_groups (null = grupo da categoria, como antes).
-- 2. save_product grava os grupos do produto (quando vierem no JSON).
-- 3. save_category só mexe nos grupos da categoria (não apaga os dos produtos).
-- 4. price_order aceita as opções do produto e marca no pedido com "choice": true,
--    para o painel, a impressão e a cozinha mostrarem "Sabor: Coca-Cola" em vez de "+ Coca-Cola".
-- 5. kitchen_order_json manda as escolhas separadas dos adicionais.

-- ---------------------------------------------------------------------------
-- 1. Grupo do produto
-- ---------------------------------------------------------------------------
alter table public.option_groups
  add column if not exists product_id uuid references public.products (id) on delete cascade;
create index if not exists option_groups_product_idx on public.option_groups (product_id, sort_order)
  where product_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Produto com os seus grupos
--   p_product.groups (opcional): [{ id?, name, min_select, max_select,
--                                   options: [{ id?, name, price_cents, active }] }]
--   Sem a chave "groups" os grupos do produto ficam como estão (importação, demonstração).
-- ---------------------------------------------------------------------------
create or replace function public.save_product(p_store_id uuid, p_product jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid := nullif(p_product->>'id', '')::uuid;
  v_category uuid := (p_product->>'category_id')::uuid;
  v_group jsonb;
  v_option jsonb;
  v_group_id uuid;
  v_keep_groups uuid[] := '{}';
  v_keep_options uuid[];
  v_child uuid;
  v_i integer := 0;
  v_j integer;
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

  -- os grupos do produto acompanham o produto se ele mudar de categoria
  update public.option_groups set category_id = v_category
   where product_id = v_id and category_id <> v_category;

  if jsonb_typeof(p_product->'groups') = 'array' then
    for v_group in select * from jsonb_array_elements(p_product->'groups') loop
      v_group_id := nullif(v_group->>'id', '')::uuid;
      if v_group_id is not null then
        update public.option_groups set
          name = btrim(v_group->>'name'),
          min_select = (v_group->>'min_select')::smallint,
          max_select = (v_group->>'max_select')::smallint,
          sort_order = v_i
        where id = v_group_id and product_id = v_id;
        if not found then v_group_id := null; end if;
      end if;
      if v_group_id is null then
        insert into public.option_groups (store_id, category_id, product_id, name, min_select, max_select, sort_order)
        values (p_store_id, v_category, v_id, btrim(v_group->>'name'), (v_group->>'min_select')::smallint,
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
    delete from public.option_groups where product_id = v_id and not (id = any (v_keep_groups));
  end if;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Categoria: só os grupos dela
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
      where id = v_group_id and category_id = v_id and product_id is null;
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
  -- só os grupos da categoria; as escolhas de cada produto (ex.: sabor) ficam com o produto
  delete from public.option_groups
   where category_id = v_id and product_id is null and not (id = any (v_keep_groups));

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Preço do pedido: opções da categoria + as do produto
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
           coalesce(jsonb_agg(
             case when g.product_id is null
               then jsonb_build_object('group', g.name, 'name', o.name, 'price_cents', o.price_cents)
               else jsonb_build_object('group', g.name, 'name', o.name, 'price_cents', o.price_cents, 'choice', true)
             end
             order by (g.product_id is null), g.sort_order, o.sort_order), '[]'::jsonb)
      into v_option_count, v_option_total, v_options
    from public.options o
    join public.option_groups g on g.id = o.group_id
    where o.id = any (v_option_ids) and g.category_id = v_category.id
      and (g.product_id is null or g.product_id = v_product.id) and o.active;
    if v_option_count <> cardinality(v_option_ids) then raise exception 'adicional_indisponivel'; end if;

    if exists (
      select 1 from public.option_groups g
      where g.category_id = v_category.id
        and (g.product_id is null or g.product_id = v_product.id)
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

-- ---------------------------------------------------------------------------
-- 5. Cozinha: escolhas (sabor) separadas dos adicionais
-- ---------------------------------------------------------------------------
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
        'choices', coalesce((select jsonb_agg(x->>'name') from jsonb_array_elements(i.options) x
                             where coalesce((x->>'choice')::boolean, false)), '[]'::jsonb),
        'options', coalesce((select jsonb_agg(x->>'name') from jsonb_array_elements(i.options) x
                             where not coalesce((x->>'choice')::boolean, false)), '[]'::jsonb),
        'notes', i.notes, 'done_at', i.kitchen_done_at
      ) order by i.sort_order, i.id)
      from public.order_items i where i.order_id = o.id
    ), '[]'::jsonb)
  )
$$;

revoke execute on function public.price_order(uuid, jsonb, boolean) from public, anon, authenticated;
revoke execute on function public.kitchen_order_json(public.orders) from public, anon, authenticated;
