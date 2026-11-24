-- Fase 6: modo demonstração
-- Cada visitante ganha a própria loja de exemplo (com usuário anônimo do Supabase Auth),
-- cheia de dados, que é apagada sozinha depois de 24 horas.

-- Apagar uma loja apaga pedidos e motoboys juntos: a checagem do motoboy fica para o fim do comando.
alter table public.orders drop constraint orders_courier_id_fkey;
alter table public.orders add constraint orders_courier_id_fkey
  foreign key (courier_id) references public.couriers (id);

-- Pix simulado (só nas lojas de demonstração).
alter table public.stores drop constraint stores_pix_provider_check;
alter table public.stores add constraint stores_pix_provider_check
  check (pix_provider in ('mercadopago', 'asaas', 'demo') and (pix_provider <> 'demo' or is_demo));
alter table public.order_payments drop constraint order_payments_provider_check;
alter table public.order_payments add constraint order_payments_provider_check
  check (provider in ('mercadopago', 'asaas', 'demo'));
alter table public.store_payment_accounts drop constraint store_payment_accounts_provider_check;
alter table public.store_payment_accounts add constraint store_payment_accounts_provider_check
  check (provider in ('mercadopago', 'asaas', 'demo'));

-- Leituras de cardápio por foto usadas na demonstração (cada uma custa uma chamada de IA).
alter table public.stores add column demo_ai_reads integer not null default 0;

-- Loja de demonstração não vira loja de verdade nem o contrário.
create or replace function public.guard_is_demo()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated')
     and new.is_demo is distinct from (case when tg_op = 'UPDATE' then old.is_demo else false end) then
    raise exception 'is_demo só pode ser alterado pelo servidor' using errcode = '42501';
  end if;
  if current_user in ('anon', 'authenticated') and tg_op = 'UPDATE'
     and new.demo_ai_reads is distinct from old.demo_ai_reads then
    raise exception 'demo_ai_reads só pode ser alterado pelo servidor' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger stores_guard_is_demo
  before insert or update on public.stores
  for each row execute function public.guard_is_demo();

-- ---------------------------------------------------------------------------
-- Limpeza: lojas de demonstração com mais de 24 horas.
-- ---------------------------------------------------------------------------
create or replace function public.purge_demo_stores()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  delete from public.stores where is_demo and created_at < now() - interval '24 hours';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cria a loja de demonstração do usuário logado (anônimo) com tudo preenchido.
-- ---------------------------------------------------------------------------
create or replace function public.create_demo_store()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_existing public.stores%rowtype;
  v_sid uuid;
  v_slug text;
  v_pizzas uuid;
  v_lanches uuid;
  v_bebidas uuid;
  v_broto uuid; v_media uuid; v_grande uuid;
  v_ze public.couriers%rowtype;
  v_lia public.couriers%rowtype;
  v_zones uuid[];
  v_menu jsonb;
  v_day date;
  v_n integer;
  v_number integer := 0;
  v_at timestamptz;
  v_order uuid;
  v_items jsonb;
  v_subtotal integer;
  v_fee integer;
  v_zone uuid;
  v_method public.payment_method;
  v_courier public.couriers%rowtype;
  v_r jsonb;
  v_today date := public.br_day(now());
  i integer;
  k integer;
begin
  if v_uid is null then raise exception 'sem permissão' using errcode = '42501'; end if;

  select s.* into v_existing from public.stores s
    join public.store_members m on m.store_id = s.id and m.user_id = v_uid
    limit 1;
  if found then
    if v_existing.is_demo then
      return jsonb_build_object('store_id', v_existing.id, 'slug', v_existing.slug, 'created', false);
    end if;
    raise exception 'ja_tem_loja';
  end if;

  perform public.purge_demo_stores();

  v_slug := 'demo-' || substr(md5(gen_random_uuid()::text), 1, 8);
  insert into public.stores (slug, name, description, whatsapp, phone, address_street, address_number,
    address_district, address_city, address_state, primary_color, min_order_cents, prep_time_minutes,
    open_override, is_demo, created_by)
  values (v_slug, 'Pizzaria Bella Massa', 'Pizzas de fermentação natural e burgers artesanais. Loja de demonstração.',
    '11999998888', '1133334444', 'Rua das Flores', '120', 'Centro', 'São Paulo', 'SP', '#C2410C', 2500, 40,
    true, true, v_uid)
  returning id into v_sid;

  perform public.replace_delivery_zones(v_sid, '[
    {"neighborhood":"Centro","fee_cents":500,"active":true,"sort_order":0},
    {"neighborhood":"Jardim América","fee_cents":700,"active":true,"sort_order":1},
    {"neighborhood":"Vila Nova","fee_cents":900,"active":true,"sort_order":2},
    {"neighborhood":"Bela Vista","fee_cents":0,"active":true,"sort_order":3}]');
  perform public.replace_store_hours(v_sid, '[
    {"weekday":0,"opens_at":"18:00","closes_at":"23:30"},{"weekday":2,"opens_at":"18:00","closes_at":"23:30"},
    {"weekday":3,"opens_at":"18:00","closes_at":"23:30"},{"weekday":4,"opens_at":"18:00","closes_at":"23:30"},
    {"weekday":5,"opens_at":"18:00","closes_at":"02:00"},{"weekday":6,"opens_at":"18:00","closes_at":"02:00"}]');
  select array_agg(id order by sort_order) into v_zones from public.delivery_zones where store_id = v_sid;

  -- cardápio
  v_pizzas := public.save_category(v_sid, '{"name":"Pizzas","description":"Massa de fermentação natural, 48h.","has_sizes":true,"half_price_rule":"highest","sizes":[{"name":"Broto","max_flavors":1},{"name":"Média","max_flavors":2},{"name":"Grande","max_flavors":3}],"groups":[{"name":"Borda recheada","min_select":0,"max_select":1,"options":[{"name":"Catupiry","price_cents":800},{"name":"Cheddar","price_cents":800},{"name":"Chocolate","price_cents":1000}]}]}');
  select id into v_broto from public.category_sizes where category_id = v_pizzas and name = 'Broto';
  select id into v_media from public.category_sizes where category_id = v_pizzas and name = 'Média';
  select id into v_grande from public.category_sizes where category_id = v_pizzas and name = 'Grande';
  perform public.save_product(v_sid, jsonb_build_object('category_id', v_pizzas, 'name', p.name, 'description', p.description,
    'prices', jsonb_build_array(jsonb_build_object('size_id', v_broto, 'price_cents', p.b),
                                jsonb_build_object('size_id', v_media, 'price_cents', p.m),
                                jsonb_build_object('size_id', v_grande, 'price_cents', p.g))))
  from (values
    ('Calabresa', 'Molho de tomate, mussarela, calabresa fatiada e cebola roxa.', 3290, 4490, 5490),
    ('Margherita', 'Mussarela de búfala, tomate e manjericão fresco.', 3490, 4790, 5890),
    ('Portuguesa', 'Presunto, ovos, cebola, ervilha, azeitona e mussarela.', 3490, 4890, 5990),
    ('Frango com Catupiry', 'Frango desfiado temperado e Catupiry original.', 3490, 4790, 5790),
    ('Quatro Queijos', 'Mussarela, provolone, parmesão e gorgonzola.', 3690, 4990, 6190),
    ('Chocolate com Morango', 'Chocolate ao leite e morangos frescos.', 3590, 4890, 5990)
  ) as p(name, description, b, m, g);

  v_lanches := public.save_category(v_sid, '{"name":"Burgers","has_sizes":false,"sizes":[],"groups":[{"name":"Ponto da carne","min_select":1,"max_select":1,"options":[{"name":"Ao ponto","price_cents":0},{"name":"Bem passado","price_cents":0}]},{"name":"Adicionais","min_select":0,"max_select":3,"options":[{"name":"Bacon","price_cents":500},{"name":"Ovo","price_cents":300},{"name":"Cheddar extra","price_cents":400}]}]}');
  perform public.save_product(v_sid, jsonb_build_object('category_id', v_lanches, 'name', p.name, 'description', p.description, 'price_cents', p.price))
  from (values
    ('Burger da Casa', 'Pão brioche, blend 180g, queijo prato, alface, tomate e molho especial.', 3290),
    ('Bacon Supremo', 'Pão brioche, blend 180g, muito bacon, cheddar e cebola caramelizada.', 3690),
    ('Smash Duplo', 'Dois smash de 90g, queijo americano e picles.', 2990)
  ) as p(name, description, price);

  v_bebidas := public.save_category(v_sid, '{"name":"Bebidas","has_sizes":false,"sizes":[],"groups":[]}');
  perform public.save_product(v_sid, jsonb_build_object('category_id', v_bebidas, 'name', p.name, 'price_cents', p.price))
  from (values ('Coca-Cola 2L', 1490), ('Guaraná Antarctica lata', 650), ('Suco natural de laranja 500ml', 1200)) as p(name, price);

  -- promoções e cupons
  insert into public.promotions (store_id, name, kind, value, product_id)
    select v_sid, 'Calabresa da semana', 'percent', 20, id from public.products where store_id = v_sid and name = 'Calabresa';
  insert into public.promotions (store_id, name, kind, value, category_id, weekdays, start_time, end_time)
    values (v_sid, 'Happy hour do burger', 'fixed', 500, v_lanches, array[2,3,4]::smallint[], '18:00', '20:00');
  insert into public.coupons (store_id, code, description, kind, value, first_order_only)
    values (v_sid, 'BEMVINDO', '10% no seu primeiro pedido', 'percent', 10, true);
  insert into public.coupons (store_id, code, description, kind, min_order_cents)
    values (v_sid, 'FRETEGRATIS', 'Entrega grátis acima de R$ 60', 'free_delivery', 6000);

  -- motoboys
  insert into public.couriers (store_id, name, phone, fee_cents, daily_rate_cents)
    values (v_sid, 'Zé Carlos', '11999990000', 700, 3000) returning * into v_ze;
  insert into public.couriers (store_id, name, phone, fee_mode)
    values (v_sid, 'Lia Souza', '11988880000', 'zone_fee') returning * into v_lia;

  -- Pix simulado
  insert into public.store_payment_accounts (store_id, provider, access_token, account_label, live_mode)
    values (v_sid, 'demo', 'demo', 'Conta de demonstração', false);
  update public.stores set pix_provider = 'demo' where id = v_sid;

  -- histórico: 13 dias de vendas para o financeiro e o acerto dos motoboys
  select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'size', s.name,
                                      'price', coalesce(pp.price_cents, p.price_cents)))
    into v_menu
  from public.products p
  left join public.product_prices pp on pp.product_id = p.id
  left join public.category_sizes s on s.id = pp.size_id
  where p.store_id = v_sid and p.active and (s.name is null or s.name in ('Média', 'Grande'));

  for v_day in select generate_series(v_today - 13, v_today - 1, interval '1 day')::date loop
    v_n := 3 + floor(random() * 6)::int + case when extract(dow from v_day) in (5, 6) then 4 else 0 end;
    for i in 1..v_n loop
      v_number := v_number + 1;
      v_at := (v_day + time '18:00' + (random() * interval '5 hours')) at time zone 'America/Sao_Paulo';
      v_items := '[]'::jsonb;
      v_subtotal := 0;
      for k in 1..(1 + floor(random() * 3)::int) loop
        v_r := v_menu -> floor(random() * jsonb_array_length(v_menu))::int;
        v_items := v_items || jsonb_build_array(v_r);
        v_subtotal := v_subtotal + (v_r->>'price')::int;
      end loop;
      v_zone := v_zones[1 + floor(random() * array_length(v_zones, 1))::int];
      select fee_cents into v_fee from public.delivery_zones where id = v_zone;
      v_method := (array['pix_online','pix_online','pix_delivery','card_delivery','card_delivery','cash'])[1 + floor(random() * 6)::int]::public.payment_method;
      v_courier := case when random() < 0.6 then v_ze else v_lia end;

      insert into public.orders (store_id, number, fulfillment, customer_name, customer_phone,
        address_street, address_number, address_district, delivery_zone_id,
        subtotal_cents, delivery_fee_cents, discount_cents, total_cents, payment_method,
        change_for_cents, status, payment_status, paid_at, created_at, accepted_at, ready_at, dispatched_at, delivered_at,
        courier_id, courier_fee_cents, assigned_at)
      values (v_sid, v_number, 'delivery',
        (array['Ana Paula','Bruno Dias','Carla Mendes','Diego Rocha','Elisa Prado','Fábio Lima','Gabi Torres','Hugo Nunes','Íris Melo','João Pedro'])[1 + floor(random() * 10)::int],
        '119' || lpad(floor(random() * 100000000)::text, 8, '0'),
        'Rua ' || (array['das Palmeiras','Sete de Setembro','dos Ipês','Bahia','XV de Novembro'])[1 + floor(random() * 5)::int],
        (10 + floor(random() * 900))::text,
        (select neighborhood from public.delivery_zones where id = v_zone), v_zone,
        v_subtotal, v_fee, 0, v_subtotal + v_fee, v_method,
        case when v_method = 'cash' then (ceil((v_subtotal + v_fee) / 5000.0) * 5000)::int end,
        case when random() < 0.05 then 'cancelled' else 'delivered' end::public.order_status,
        case when v_method = 'pix_online' then 'paid' else 'on_delivery' end::public.payment_status,
        case when v_method = 'pix_online' then v_at end,
        v_at, v_at + interval '2 minutes', v_at + interval '25 minutes', v_at + interval '28 minutes', v_at + interval '45 minutes',
        v_courier.id,
        case when v_courier.fee_mode = 'fixed' then v_courier.fee_cents else v_fee end,
        v_at + interval '20 minutes')
      returning id into v_order;

      insert into public.order_items (order_id, store_id, product_id, product_name, size_name, flavors,
        options, quantity, unit_price_cents, total_cents, sort_order)
      select v_order, v_sid, (it->>'id')::uuid, it->>'name', it->>'size',
             case when it->>'size' is not null then array[it->>'name'] end,
             '[]'::jsonb, 1, (it->>'price')::int, (it->>'price')::int, ord::int
      from jsonb_array_elements(v_items) with ordinality as t(it, ord);
    end loop;
  end loop;
  update public.orders set cancelled_at = delivered_at, delivered_at = null, cancel_reason = 'Cliente desistiu'
    where store_id = v_sid and status = 'cancelled';

  -- acertos dos dias anteriores já pagos (menos ontem, para mostrar um em aberto)
  insert into public.courier_payouts (store_id, courier_id, day, amount_cents, paid_by)
  select v_sid, c.id, d.day::date, (public.courier_day_json(c, d.day::date)->>'earned_cents')::int, v_uid
  from public.couriers c
  cross join generate_series(v_today - 13, v_today - 2, interval '1 day') as d(day)
  where c.store_id = v_sid and (public.courier_day_json(c, d.day::date)->>'deliveries')::int > 0;

  -- pedidos de agora: um novo, um em preparo com o Zé e um na rua com a Lia
  v_r := public.place_order(v_sid, jsonb_build_object(
    'fulfillment', 'delivery', 'customer_name', 'Marina Costa', 'customer_phone', '11987654321',
    'address_street', 'Rua dos Ipês', 'address_number', '45', 'address_reference', 'Portão azul',
    'delivery_zone_id', v_zones[2], 'payment_method', 'cash', 'change_for_cents', 10000,
    'items', jsonb_build_array(
      jsonb_build_object('product_id', (select id from public.products where store_id = v_sid and name = 'Calabresa'),
                         'size_id', v_grande, 'quantity', 1),
      jsonb_build_object('product_id', (select id from public.products where store_id = v_sid and name = 'Coca-Cola 2L'), 'quantity', 1))));

  v_r := public.place_order(v_sid, jsonb_build_object(
    'fulfillment', 'delivery', 'customer_name', 'Rafael Gomes', 'customer_phone', '11976543210',
    'address_street', 'Av. Brasil', 'address_number', '1500', 'address_complement', 'Apto 42',
    'delivery_zone_id', v_zones[1], 'payment_method', 'card_delivery',
    'items', jsonb_build_array(
      jsonb_build_object('product_id', (select id from public.products where store_id = v_sid and name = 'Bacon Supremo'),
                         'option_ids', (select jsonb_agg(o.id) from public.options o join public.option_groups g on g.id = o.group_id
                                        where g.store_id = v_sid and o.name = 'Ao ponto'), 'quantity', 2))));
  update public.orders set status = 'preparing' where id = (v_r->>'id')::uuid;
  perform public.assign_courier((v_r->>'id')::uuid, v_ze.id);

  v_r := public.place_order(v_sid, jsonb_build_object(
    'fulfillment', 'delivery', 'customer_name', 'Sofia Martins', 'customer_phone', '11965432109',
    'address_street', 'Rua Bahia', 'address_number', '230',
    'delivery_zone_id', v_zones[3], 'payment_method', 'pix_delivery',
    'items', jsonb_build_array(
      jsonb_build_object('product_id', (select id from public.products where store_id = v_sid and name = 'Margherita'),
                         'size_id', v_media, 'quantity', 1))));
  update public.orders set status = 'ready' where id = (v_r->>'id')::uuid;
  perform public.assign_courier((v_r->>'id')::uuid, v_lia.id);
  update public.orders set status = 'out_for_delivery' where id = (v_r->>'id')::uuid;

  return jsonb_build_object('store_id', v_sid, 'slug', v_slug, 'created', true);
end;
$$;

-- Pedido de cliente simulado (botão "Simular pedido" da demonstração).
create or replace function public.demo_simulate_order(p_store_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store public.stores%rowtype;
  v_product public.products%rowtype;
  v_size uuid;
  v_price integer;
  v_qty integer;
  v_zone uuid;
begin
  select * into v_store from public.stores where id = p_store_id;
  if not found or not v_store.is_demo or not public.is_store_member(p_store_id) then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  select p.* into v_product from public.products p
    join public.categories c on c.id = p.category_id
    where p.store_id = p_store_id and p.active and c.active
      and not exists (select 1 from public.option_groups g where g.category_id = c.id and g.min_select > 0)
    order by random() limit 1;
  if not found then raise exception 'cardapio_vazio'; end if;
  select pp.size_id, pp.price_cents into v_size, v_price
    from public.product_prices pp where pp.product_id = v_product.id order by pp.price_cents desc limit 1;
  v_price := coalesce(v_price, v_product.price_cents, 1000);
  -- quantidade suficiente para passar do pedido mínimo
  v_qty := greatest(1 + floor(random() * 2)::int, ceil(v_store.min_order_cents::numeric / greatest(v_price, 1))::int);
  select id into v_zone from public.delivery_zones where store_id = p_store_id and active order by random() limit 1;
  return public.place_order(p_store_id, jsonb_build_object(
    'fulfillment', case when v_zone is null then 'pickup' else 'delivery' end,
    'customer_name', (array['Lucas Almeida','Patrícia Reis','Thiago Moura','Vanessa Lopes','William Cruz'])[1 + floor(random() * 5)::int],
    'customer_phone', '119' || lpad(floor(random() * 100000000)::text, 8, '0'),
    'address_street', 'Rua das Acácias', 'address_number', (10 + floor(random() * 900))::text,
    'delivery_zone_id', v_zone,
    'payment_method', (array['pix_delivery','card_delivery','cash'])[1 + floor(random() * 3)::int],
    'items', jsonb_build_array(jsonb_build_object('product_id', v_product.id, 'size_id', v_size, 'quantity', least(v_qty, 50)))));
end;
$$;

-- Pix simulado: o "cliente" paga pela página do pedido (só em loja de demonstração).
create or replace function public.demo_pay_pix(p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.order_payments%rowtype;
begin
  select p.* into v_payment
  from public.orders o
  join public.stores s on s.id = o.store_id and s.is_demo
  join public.order_payments p on p.order_id = o.id and p.provider = 'demo'
  where o.public_token = p_token and o.payment_status = 'awaiting';
  if not found then return false; end if;
  return public.mark_order_paid(v_payment.order_id, v_payment.external_id, v_payment.amount_cents);
end;
$$;

-- Uma leitura de cardápio por foto a mais (a demonstração permite 3 por loja).
create or replace function public.consume_demo_ai_read(p_store_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store public.stores%rowtype;
begin
  select * into v_store from public.stores where id = p_store_id for update;
  if not found or not public.is_store_member(p_store_id) then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  if not v_store.is_demo then return true; end if;
  if v_store.demo_ai_reads >= 3 then return false; end if;
  update public.stores set demo_ai_reads = demo_ai_reads + 1 where id = p_store_id;
  return true;
end;
$$;

revoke execute on function public.purge_demo_stores() from public, anon, authenticated;
revoke execute on function public.create_demo_store() from public, anon;
revoke execute on function public.demo_simulate_order(uuid) from public, anon;
revoke execute on function public.consume_demo_ai_read(uuid) from public, anon;
grant execute on function public.create_demo_store() to authenticated;
grant execute on function public.demo_simulate_order(uuid) to authenticated;
grant execute on function public.consume_demo_ai_read(uuid) to authenticated;
grant execute on function public.demo_pay_pix(uuid) to anon, authenticated;
