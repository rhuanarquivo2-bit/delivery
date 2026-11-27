-- Fase 18: bairro e taxa de entrega automáticos pelo CEP.
-- Pode rodar mais de uma vez sem problema (tudo é "se não existir" / "substitui").
--
-- 1. Outros nomes do bairro: a loja pode dizer que "Praia" e "Vila Praia" são o seu "Centro".
--    O checkout acha o bairro de entrega sozinho pelo nome que vem do CEP.
-- 2. Bairro fora da lista: a loja escolhe entre "não entregar" e "entregar com uma taxa".
--    Essa taxa fica numa linha especial de delivery_zones (catch_all = true, no máximo uma por
--    loja), então o pedido, o financeiro e o motoboy continuam funcionando do mesmo jeito.
-- 3. Pedido de bairro fora da lista guarda o bairro de verdade do cliente (ex.: "Praia"),
--    e não "Outros bairros", para o motoboy e o desempenho por bairro.

-- ---------------------------------------------------------------------------
-- 1 e 2. Colunas novas
-- ---------------------------------------------------------------------------
alter table public.delivery_zones add column if not exists aliases text[] not null default '{}';
alter table public.delivery_zones add column if not exists catch_all boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'delivery_zones_aliases_check') then
    alter table public.delivery_zones add constraint delivery_zones_aliases_check
      check (cardinality(aliases) <= 20 and char_length(array_to_string(aliases, '|')) <= 600);
  end if;
end $$;

create unique index if not exists delivery_zones_one_catch_all
  on public.delivery_zones (store_id) where catch_all;

-- Salvar os bairros agora leva os outros nomes e a linha "fora da lista".
create or replace function public.replace_delivery_zones(p_store_id uuid, p_rows jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.is_store_member(p_store_id) then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  delete from public.delivery_zones where store_id = p_store_id;
  insert into public.delivery_zones (store_id, neighborhood, fee_cents, active, sort_order, aliases, catch_all)
  select p_store_id, r->>'neighborhood', (r->>'fee_cents')::integer, (r->>'active')::boolean, (r->>'sort_order')::integer,
    coalesce(
      (select array_agg(left(btrim(a), 80)) from jsonb_array_elements_text(coalesce(r->'aliases', '[]'::jsonb)) a
       where btrim(a) <> ''),
      '{}'),
    coalesce((r->>'catch_all')::boolean, false)
  from jsonb_array_elements(p_rows) as r;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Pedido guarda o bairro do cliente quando cai em "outros bairros"
-- ---------------------------------------------------------------------------
-- A versão atual de place_order (com pontos de fidelidade) vira place_order_loyalty,
-- e place_order passa a chamar ela e depois anotar o bairro.
do $$
begin
  if to_regprocedure('public.place_order_loyalty(uuid, jsonb)') is null then
    alter function public.place_order(uuid, jsonb) rename to place_order_loyalty;
  end if;
end $$;
revoke all on function public.place_order_loyalty(uuid, jsonb) from public, anon, authenticated;

create or replace function public.place_order(p_store_id uuid, p_order jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_district text := left(btrim(regexp_replace(coalesce(p_order->>'address_district', ''), '\s+', ' ', 'g')), 80);
begin
  v_result := public.place_order_loyalty(p_store_id, p_order - 'address_district');
  if char_length(v_district) >= 2 then
    update public.orders o
       set address_district = v_district
      from public.delivery_zones z
     where o.id = (v_result->>'id')::uuid
       and o.fulfillment = 'delivery'
       and z.id = o.delivery_zone_id
       and z.catch_all;
  end if;
  return v_result;
end;
$$;

revoke all on function public.place_order(uuid, jsonb) from public;
grant execute on function public.place_order(uuid, jsonb) to anon, authenticated;
