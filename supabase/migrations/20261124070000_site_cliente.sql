-- Fase 8: ajustes no site do cliente.
-- 1. "Mais pedido": os produtos mais vendidos da loja nos últimos 30 dias.
-- 2. Cadastro do cliente pelo celular: ao digitar o número no checkout, os dados
--    do último pedido daquele número naquela loja voltam preenchidos.

-- 1. Mais pedidos ------------------------------------------------------------
-- Só conta pedidos não cancelados dos últimos 30 dias. Um produto só ganha o
-- selo se tiver pelo menos p_min_units unidades vendidas (loja nova não marca
-- qualquer produto como "mais pedido").
create or replace function public.best_sellers(p_store_id uuid, p_limit integer default 3, p_min_units integer default 5)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select i.product_id
  from public.order_items i
  join public.orders o on o.id = i.order_id
  join public.products p on p.id = i.product_id
  where i.store_id = p_store_id
    and o.store_id = p_store_id
    and o.status <> 'cancelled'
    and o.payment_status not in ('awaiting', 'expired')
    and o.created_at >= now() - interval '30 days'
  group by i.product_id
  having sum(i.quantity) >= greatest(p_min_units, 1)
  order by sum(i.quantity) desc, count(distinct i.order_id) desc, i.product_id
  limit least(greatest(p_limit, 0), 10);
$$;

-- 2. Cliente pelo celular ----------------------------------------------------
-- Devolve nome e endereço do último pedido desse celular nessa loja.
-- Não devolve histórico, valores nem outros pedidos.
create or replace function public.customer_lookup(p_store_id uuid, p_phone text)
returns table (
  name text,
  street text,
  number text,
  complement text,
  reference text,
  delivery_zone_id uuid,
  zip text,
  orders bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with phone as (
    select regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') as digits
  ),
  mine as (
    select o.*
    from public.orders o, phone
    where o.store_id = p_store_id
      and length(phone.digits) between 10 and 11
      and o.customer_phone = phone.digits
  )
  select
    last.customer_name,
    addr.address_street,
    addr.address_number,
    addr.address_complement,
    addr.address_reference,
    addr.delivery_zone_id,
    addr.address_zip,
    (select count(*) from mine where status <> 'cancelled')
  from (select * from mine order by created_at desc limit 1) last
  -- endereço do último pedido com entrega (o último pode ter sido retirada)
  left join lateral (
    select * from mine where fulfillment = 'delivery' order by created_at desc limit 1
  ) addr on true;
$$;

revoke all on function public.best_sellers(uuid, integer, integer) from public;
revoke all on function public.customer_lookup(uuid, text) from public;
grant execute on function public.best_sellers(uuid, integer, integer) to anon, authenticated;
grant execute on function public.customer_lookup(uuid, text) to anon, authenticated;
