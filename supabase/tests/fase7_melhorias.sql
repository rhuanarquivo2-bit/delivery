\set ON_ERROR_STOP 0
-- Fase 7: pedido agendado, CEP, clientes, desempenho e configurações novas da loja.
reset role;
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into stores (slug, name, prep_time_minutes) values ('agenda7', 'Loja Agenda', 40) returning id as sid \gset
select save_category(:'sid', '{"name":"Lanches","has_sizes":false,"sizes":[],"groups":[]}') as cat \gset
select save_product(:'sid', jsonb_build_object('category_id',:'cat','name','X-Burger','price_cents',3000)) as burger \gset
insert into delivery_zones (store_id, neighborhood, fee_cents) values (:'sid','Centro',500) returning id as zona \gset
-- funciona todos os dias das 10:00 às 22:00
select replace_store_hours(:'sid', (select jsonb_agg(jsonb_build_object('weekday', d, 'opens_at', '10:00', 'closes_at', '22:00')) from generate_series(0,6) d));

-- configurações novas: formato dos códigos conferido no banco
update stores set facebook_pixel_id = '<script>' where id = :'sid';  -- ERRO formato
update stores set google_analytics_id = 'UA-123' where id = :'sid';  -- ERRO formato
update stores set facebook_pixel_id = '123456789012345', google_analytics_id = 'G-ABC123XYZ' where id = :'sid' returning facebook_pixel_id, google_analytics_id;
update stores set schedule_days_ahead = 9 where id = :'sid';  -- ERRO (máximo 7)

-- horários de teste (amanhã, no horário de Brasília)
select ((current_date + 1)::timestamp + time '20:00') at time zone 'America/Sao_Paulo' as amanha_20h,
       ((current_date + 1)::timestamp + time '20:07') at time zone 'America/Sao_Paulo' as amanha_quebrado,
       ((current_date + 1)::timestamp + time '23:00') at time zone 'America/Sao_Paulo' as amanha_23h,
       ((current_date + 1)::timestamp + time '08:00') at time zone 'America/Sao_Paulo' as amanha_8h,
       ((current_date + 9)::timestamp + time '20:00') at time zone 'America/Sao_Paulo' as longe,
       date_trunc('hour', now()) + interval '15 minutes' * ceil(extract(minute from now()) / 15.0) + interval '15 minutes' as logo_mais
\gset

reset role; set role anon; set request.jwt.claim.sub = '';
\set base '{"fulfillment":"delivery","customer_name":"Maria","customer_phone":"11988887777","address_street":"Rua A","address_number":"10","payment_method":"card_delivery"}'
-- loja não aceita agendamento ainda
select place_order(:'sid', (:'base'::jsonb) || jsonb_build_object('scheduled_for', :'amanha_20h', 'delivery_zone_id', :'zona', 'items', jsonb_build_array(jsonb_build_object('product_id', :'burger'))));  -- ERRO agendamento_indisponivel
reset role; update stores set accepts_scheduled = true, open_override = false where id = :'sid'; set role anon;
-- pedido para agora com a loja fechada
select place_order(:'sid', (:'base'::jsonb) || jsonb_build_object('delivery_zone_id', :'zona', 'items', jsonb_build_array(jsonb_build_object('product_id', :'burger'))));  -- ERRO loja_fechada
select place_order(:'sid', (:'base'::jsonb) || jsonb_build_object('scheduled_for', 'ontem à noite', 'delivery_zone_id', :'zona', 'items', jsonb_build_array(jsonb_build_object('product_id', :'burger'))));  -- ERRO agendamento_invalido
select place_order(:'sid', (:'base'::jsonb) || jsonb_build_object('scheduled_for', :'amanha_quebrado', 'delivery_zone_id', :'zona', 'items', jsonb_build_array(jsonb_build_object('product_id', :'burger'))));  -- ERRO agendamento_invalido
select place_order(:'sid', (:'base'::jsonb) || jsonb_build_object('scheduled_for', :'amanha_23h', 'delivery_zone_id', :'zona', 'items', jsonb_build_array(jsonb_build_object('product_id', :'burger'))));  -- ERRO agendamento_fora_horario
select place_order(:'sid', (:'base'::jsonb) || jsonb_build_object('scheduled_for', :'amanha_8h', 'delivery_zone_id', :'zona', 'items', jsonb_build_array(jsonb_build_object('product_id', :'burger'))));  -- ERRO agendamento_fora_horario
select place_order(:'sid', (:'base'::jsonb) || jsonb_build_object('scheduled_for', :'longe', 'delivery_zone_id', :'zona', 'items', jsonb_build_array(jsonb_build_object('product_id', :'burger'))));  -- ERRO agendamento_longe
select place_order(:'sid', (:'base'::jsonb) || jsonb_build_object('scheduled_for', :'logo_mais', 'delivery_zone_id', :'zona', 'items', jsonb_build_array(jsonb_build_object('product_id', :'burger'))));  -- ERRO agendamento_cedo (ou fora do horário, conforme a hora do teste)
select place_order(:'sid', (:'base'::jsonb) || jsonb_build_object('address_zip', '123', 'scheduled_for', :'amanha_20h', 'delivery_zone_id', :'zona', 'items', jsonb_build_array(jsonb_build_object('product_id', :'burger'))));  -- ERRO cep_invalido
-- agendado para amanhã às 20h, com CEP: ok mesmo com a loja fechada agora
select place_order(:'sid', (:'base'::jsonb) || jsonb_build_object('address_zip', '01310-100', 'scheduled_for', :'amanha_20h', 'delivery_zone_id', :'zona', 'items', jsonb_build_array(jsonb_build_object('product_id', :'burger')))) as r \gset
select (get_public_order((:'r'::jsonb->>'token')::uuid) ->> 'scheduled_for')::timestamptz = :'amanha_20h'::timestamptz as agendado_ok;
-- retirada não grava CEP
select place_order(:'sid', '{"fulfillment":"pickup","customer_name":"Joao","customer_phone":"11977776666","payment_method":"cash","address_zip":"01310100"}'::jsonb || jsonb_build_object('scheduled_for', :'amanha_20h', 'items', jsonb_build_array(jsonb_build_object('product_id', :'burger')))) ->> 'number' as retirada_agendada;
-- pedido para agora volta a funcionar com a loja aberta
reset role; update stores set open_override = true where id = :'sid'; set role anon;
select place_order(:'sid', (:'base'::jsonb) || jsonb_build_object('delivery_zone_id', :'zona', 'items', jsonb_build_array(jsonb_build_object('product_id', :'burger'), jsonb_build_object('product_id', :'burger', 'quantity', 2)))) ->> 'number' as agora;
reset role;
select number, fulfillment, address_zip, scheduled_for is not null as agendado from orders where store_id = :'sid' order by number;
-- 1 delivery 01310100 t | 2 pickup (sem CEP) t | 3 delivery (sem CEP) f

-- anônimo e outra loja não veem clientes nem desempenho
set role anon;
select * from customer_report(:'sid');  -- ERRO sem permissão
reset role; set role authenticated; set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select * from customer_report(:'sid');  -- ERRO sem permissão
select performance_report(:'sid', current_date - 7, current_date + 1);  -- ERRO sem permissão

-- dono
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update orders set status = 'cancelled' where store_id = :'sid' and number = 2;
select phone, name, orders, cancelled, total_cents, district from customer_report(:'sid') order by phone;
-- 11977776666 Joao 0 1 0 | 11988887777 Maria 2 0 (3500 + 9500) Centro
select r ->> 'orders' as pedidos, r ->> 'cancelled_orders' as cancelados, r ->> 'scheduled_orders' as agendados,
       r ->> 'customers' as clientes, r ->> 'new_customers' as novos,
       jsonb_array_length(r -> 'by_hour') as horas, jsonb_array_length(r -> 'by_weekday') as dias,
       r -> 'top_districts' as bairros
from (select performance_report(:'sid', current_date - 7, current_date + 1) as r) x;
-- 2 pedidos, 1 cancelado, 1 agendado, 1 cliente, 1 novo, 24 horas, 7 dias, Centro com 2
select performance_report(:'sid', current_date, current_date - 1);  -- ERRO periodo_invalido

-- loja de demonstração nasce com agendamento e janela de promoções ligados
reset role;
insert into stores (slug, name, is_demo, created_by) values ('demo-f7', 'Demo F7', true, '11111111-1111-1111-1111-111111111111')
  returning accepts_scheduled, show_promo_popup, print_kitchen_copy;
-- t t t
