\set ON_ERROR_STOP 0
-- Fase 5: motoboys.
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into stores (slug, name, open_override) values ('moto5', 'Moto Cinco', true) returning id as sid \gset
insert into delivery_zones (store_id, neighborhood, fee_cents) values (:'sid', 'Centro', 800) returning id as zona \gset
select import_menu(:'sid', '{"categories":[{"name":"Lanches","products":[{"name":"X-Tudo","price_cents":3000}]}]}');
select id as xtudo from products where store_id = :'sid' \gset
insert into couriers (store_id, name, phone, fee_cents, daily_rate_cents) values (:'sid', 'Zé', '11999990000', 700, 3000) returning id as ze, access_token as ze_token \gset
insert into couriers (store_id, name, fee_mode) values (:'sid', 'Lia', 'zone_fee') returning id as lia, access_token as lia_token \gset
insert into couriers (store_id, name, active) values (:'sid', 'Inativo', false) returning id as inativo \gset
insert into couriers (store_id, name) values (:'sid', 'X');  -- ERRO nome curto

\set base '{"fulfillment":"delivery","customer_name":"Ana","customer_phone":"11912345678","address_street":"Rua A","address_number":"1"}'
reset role; set role anon; set request.jwt.claim.sub = '';
select count(*) as anon_ve_motoboys from couriers;  -- ERRO permissão
select place_order(:'sid', (:'base'::jsonb) || jsonb_build_object('delivery_zone_id', :'zona', 'payment_method', 'cash', 'change_for_cents', 5000, 'items', jsonb_build_array(jsonb_build_object('product_id', :'xtudo')))) ->> 'id' as p1 \gset
select place_order(:'sid', (:'base'::jsonb) || jsonb_build_object('delivery_zone_id', :'zona', 'payment_method', 'card_delivery', 'items', jsonb_build_array(jsonb_build_object('product_id', :'xtudo')))) ->> 'id' as p2 \gset
select place_order(:'sid', (:'base'::jsonb) || jsonb_build_object('delivery_zone_id', :'zona', 'payment_method', 'pix_delivery', 'items', jsonb_build_array(jsonb_build_object('product_id', :'xtudo')))) ->> 'id' as p3 \gset
select place_order(:'sid', '{"fulfillment":"pickup","customer_name":"Bia","customer_phone":"11912345678","payment_method":"cash"}'::jsonb || jsonb_build_object('items', jsonb_build_array(jsonb_build_object('product_id', :'xtudo')))) ->> 'id' as retirada \gset
select assign_courier(:'p1', :'ze');  -- ERRO anon não pode

reset role; set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select assign_courier(:'p1', :'ze') ->> 'courier_fee_cents' as taxa_fixa;           -- 700
select assign_courier(:'p2', :'lia') ->> 'courier_fee_cents' as taxa_do_bairro;     -- 800
select assign_courier(:'p3', :'ze') ->> 'courier_fee_cents' as taxa_fixa2;          -- 700
select assign_courier(:'retirada', :'ze');  -- ERRO pedido_retirada
select assign_courier(:'p1', :'inativo');  -- ERRO motoboy_invalido
update orders set courier_id = :'lia' where id = :'p1';  -- ERRO só pela função (sem permissão de coluna)

-- loja aceita os pedidos
update orders set status = 'preparing' where id in (:'p1', :'p3');
update orders set status = 'ready' where id = :'p2';

-- outro usuário não mexe
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select assign_courier(:'p1', null);  -- ERRO sem permissão
select count(*) as outro_ve_motoboys from couriers where store_id = :'sid';  -- 0
select courier_report(:'sid', current_date - 1, current_date);  -- ERRO sem permissão

-- site do motoboy (anon, pelo link)
reset role; set role anon; set request.jwt.claim.sub = '';
select courier_portal(gen_random_uuid()) is null as link_falso_nada;  -- t
select jsonb_array_length(courier_portal(:'ze_token') -> 'open') as ze_em_aberto;  -- 2
select courier_update(:'ze_token', :'p2', 'deliver');  -- ERRO pedido_nao_encontrado (é da Lia)
select courier_update(:'ze_token', :'p1', 'dispatch');  -- out_for_delivery
select courier_update(:'ze_token', :'p1', 'dispatch');  -- ERRO status_invalido
select courier_update(:'ze_token', :'p1', 'deliver');   -- delivered
select courier_update(:'ze_token', :'p3', 'deliver');   -- delivered (direto)
select courier_update(:'lia_token', :'p2', 'voar');     -- ERRO acao_invalida
select status, dispatched_at is not null as saiu, delivered_at is not null as entregou from orders where id = :'p3';  -- 0 linhas: anon não lê pedidos

reset role; set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select status, dispatched_at is not null as saiu, delivered_at is not null as entregou from orders where id in (:'p1', :'p3');
select assign_courier(:'p1', :'lia');  -- ERRO pedido_encerrado

reset role; set role anon;
select (courier_portal(:'ze_token') -> 'days' -> 0) - 'day' as ze_hoje;
-- 2 entregas, taxas 1400, diária 3000, ganhou 4400, dinheiro 3800 (3000 + 800), pix 3800

reset role; set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select jsonb_array_length(courier_report(:'sid', current_date - 1, current_date + 1)) as linhas_acerto;  -- 1 (só o Zé entregou)
select set_courier_payout(:'lia', current_date, true);  -- ERRO sem_entregas
select set_courier_payout(:'ze', public.br_day(now()), true) ->> 'paid_cents' as pago;  -- 4400
select count(*) as acertos from courier_payouts;  -- 1
insert into courier_payouts (store_id, courier_id, day, amount_cents) values (:'sid', :'ze', current_date - 3, 1);  -- ERRO só pela função
select set_courier_payout(:'ze', public.br_day(now()), false) ->> 'paid_cents' as desfeito;  -- null

-- trocar o link derruba o antigo
update couriers set access_token = gen_random_uuid() where id = :'ze';
reset role; set role anon;
select courier_portal(:'ze_token') is null as link_antigo_morto;  -- t
reset role;
