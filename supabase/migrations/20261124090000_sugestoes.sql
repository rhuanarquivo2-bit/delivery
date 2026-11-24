-- Fase 10: sugestões no carrinho ("quem pede X costuma levar Y").
-- Ordem das sugestões:
--   1. produtos fixados pelo lojista (até 3);
--   2. comprados junto com os itens do carrinho nos últimos 90 dias (em 2 ou mais pedidos);
--   3. reserva: mais vendidos de categorias que ainda não estão no carrinho
--      (ex.: bebidas para quem só pegou pizza), depois a ordem do cardápio.
-- Produtos pausados e itens que já estão no carrinho nunca são sugeridos.

alter table public.stores
  add column upsell_enabled boolean not null default true,
  add column upsell_product_ids uuid[] not null default '{}'
    check (cardinality(upsell_product_ids) <= 3);

create or replace function public.cart_suggestions(p_store_id uuid, p_product_ids uuid[], p_limit integer default 3)
returns table (product_id uuid, reason text, source_product_id uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_store public.stores;
  v_cart uuid[] := coalesce(p_product_ids[1:30], '{}');
  v_limit integer := least(greatest(coalesce(p_limit, 3), 0), 6);
  v_taken uuid[] := '{}';
  r record;
begin
  select * into v_store from public.stores where id = p_store_id;
  if not found or not v_store.upsell_enabled or v_limit = 0 or cardinality(v_cart) = 0 then
    return;
  end if;

  -- 1. fixados pelo lojista (na ordem escolhida)
  for r in
    select p.id
    from unnest(v_store.upsell_product_ids) with ordinality f(id, ord)
    join public.products p on p.id = f.id
    join public.categories c on c.id = p.category_id
    where p.store_id = p_store_id and p.active and c.active and p.id <> all (v_cart)
    order by f.ord
  loop
    exit when cardinality(v_taken) >= v_limit;
    v_taken := v_taken || r.id;
    product_id := r.id; reason := 'pinned'; source_product_id := null;
    return next;
  end loop;

  -- 2. comprados juntos
  for r in
    with recent as (
      select o.id
      from public.orders o
      where o.store_id = p_store_id
        and o.status <> 'cancelled'
        and o.payment_status not in ('awaiting', 'expired')
        and o.created_at >= now() - interval '90 days'
    ),
    with_cart as (
      select distinct i.order_id, i.product_id as source
      from public.order_items i
      join recent on recent.id = i.order_id
      where i.product_id = any (v_cart)
    ),
    pairs as (
      select i.product_id as id, w.source, count(distinct i.order_id) as together
      from with_cart w
      join public.order_items i on i.order_id = w.order_id
      where i.product_id is not null and i.product_id <> all (v_cart)
      group by i.product_id, w.source
    ),
    best as (
      select distinct on (pairs.id) pairs.id, pairs.source, pairs.together
      from pairs
      order by pairs.id, pairs.together desc, pairs.source
    )
    select best.id, best.source
    from best
    join public.products p on p.id = best.id
    join public.categories c on c.id = p.category_id
    where best.together >= 2 and p.active and c.active and p.store_id = p_store_id
    order by best.together desc, best.id
  loop
    exit when cardinality(v_taken) >= v_limit;
    continue when r.id = any (v_taken);
    v_taken := v_taken || r.id;
    product_id := r.id; reason := 'together'; source_product_id := r.source;
    return next;
  end loop;

  -- 3. reserva: categorias que faltam no carrinho (mais vendidos primeiro)
  for r in
    select p.id
    from public.products p
    join public.categories c on c.id = p.category_id
    left join lateral (
      select sum(i.quantity) as sold
      from public.order_items i
      join public.orders o on o.id = i.order_id
      where i.product_id = p.id and o.status <> 'cancelled' and o.created_at >= now() - interval '30 days'
    ) s on true
    where p.store_id = p_store_id and p.active and c.active
      and p.id <> all (v_cart)
      and p.category_id not in (select category_id from public.products where id = any (v_cart))
    order by coalesce(s.sold, 0) desc, c.sort_order, p.sort_order, p.name
  loop
    exit when cardinality(v_taken) >= v_limit;
    continue when r.id = any (v_taken);
    v_taken := v_taken || r.id;
    product_id := r.id; reason := 'popular'; source_product_id := null;
    return next;
  end loop;
end;
$$;

revoke all on function public.cart_suggestions(uuid, uuid[], integer) from public;
grant execute on function public.cart_suggestions(uuid, uuid[], integer) to anon, authenticated;
