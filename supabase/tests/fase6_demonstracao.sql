\set ON_ERROR_STOP 0
-- Fase 6: modo demonstração.
reset role;
insert into auth.users values ('33333333-3333-3333-3333-333333333333'), ('44444444-4444-4444-4444-444444444444');

-- visitante anônimo cria a loja de demonstração
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select create_demo_store() ->> 'created' as criada;  -- true
select create_demo_store() ->> 'created' as de_novo;  -- false (a mesma loja)
select id as sid, slug from stores where is_demo \gset
select is_demo, pix_provider, open_override from stores where id = :'sid';
select count(*) > 8 as produtos from products where store_id = :'sid';
select count(*) as motoboys from couriers where store_id = :'sid';  -- 2
select count(*) > 30 as historico from orders where store_id = :'sid' and status = 'delivered';
select status, courier_id is not null as com_motoboy from orders where store_id = :'sid' and created_at > now() - interval '1 minute' order by number;
-- pending sem motoboy, preparing com motoboy, out_for_delivery com motoboy
select (finance_report(:'sid', current_date - 14, current_date) ->> 'orders')::int > 30 as financeiro_cheio;
select count(*) > 0 as acertos_pagos from courier_payouts where store_id = :'sid';

-- dono da demonstração não muda is_demo nem o contador de IA
update stores set is_demo = false where id = :'sid';  -- ERRO
update stores set demo_ai_reads = 5 where id = :'sid';  -- ERRO
-- usuário com loja de verdade não cria demonstração
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select create_demo_store();  -- ERRO ja_tem_loja
insert into stores (slug, name, is_demo) values ('fakedemo', 'Fake', true);  -- ERRO is_demo
select demo_simulate_order(:'sid');  -- ERRO sem permissão (não é da loja)

set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select demo_simulate_order(:'sid') ->> 'number' is not null as pedido_simulado;
select consume_demo_ai_read(:'sid'), consume_demo_ai_read(:'sid'), consume_demo_ai_read(:'sid'), consume_demo_ai_read(:'sid') as quarta;  -- t t t f

-- Pix simulado
reset role; set role anon; set request.jwt.claim.sub = '';
select id as calabresa from products where store_id = :'sid' and name = 'Calabresa' \gset
reset role;
select id as calabresa from products where store_id = :'sid' and name = 'Calabresa' \gset
select s.id as grande from category_sizes s join categories c on c.id = s.category_id where c.store_id = :'sid' and s.name = 'Grande' \gset
select id as zona from delivery_zones where store_id = :'sid' limit 1 \gset
set role anon;
select place_order(:'sid', jsonb_build_object('fulfillment','delivery','customer_name','Teo','customer_phone','11912345678',
  'address_street','Rua A','address_number','1','delivery_zone_id', :'zona','payment_method','pix_online',
  'items', jsonb_build_array(jsonb_build_object('product_id', :'calabresa', 'size_id', :'grande')))) as pix \gset
reset role; set role service_role;
insert into order_payments (order_id, store_id, provider, external_id, amount_cents, qr_code, expires_at)
  values ((:'pix'::jsonb->>'id')::uuid, :'sid', 'demo', 'demo-1', (:'pix'::jsonb->>'total_cents')::int, '000201', now() + interval '30 minutes');
reset role; set role anon;
select demo_pay_pix(gen_random_uuid()) as token_falso;  -- f
select demo_pay_pix((:'pix'::jsonb->>'token')::uuid) as pagou;  -- t
select get_public_order((:'pix'::jsonb->>'token')::uuid) ->> 'payment_status' as status;  -- paid

-- Pix simulado não vale em loja de verdade
reset role;
update stores set pix_provider = 'demo' where slug = 'moto5';  -- ERRO (constraint)

-- limpeza: loja com mais de 24h some, com pedidos e motoboys
update stores set created_at = now() - interval '25 hours' where id = :'sid';
set role authenticated; set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
select create_demo_store() ->> 'created' as outra_demo;  -- true (e apaga a antiga)
reset role;
select count(*) as demo_antiga from stores where id = :'sid';  -- 0
select count(*) as pedidos_antigos from orders where store_id = :'sid';  -- 0
select count(*) as demos from stores where is_demo;  -- 1
