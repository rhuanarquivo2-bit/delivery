\set ON_ERROR_STOP 0
-- Fase 11: fidelidade.
reset role;
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into stores (slug, name, open_override) values ('fiel11', 'Loja Fiel', true) returning id as sid \gset
select save_category(:'sid', '{"name":"Lanches","has_sizes":false,"sizes":[],"groups":[]}') as cat \gset
select save_product(:'sid', jsonb_build_object('category_id',:'cat','name','X-Burger','price_cents',3000)) as burger \gset
select save_product(:'sid', jsonb_build_object('category_id',:'cat','name','Batata','price_cents',1500)) as batata \gset
update stores set loyalty_welcome_points = 10 where id = :'sid';
insert into loyalty_rewards (store_id, name, points_cost, kind, product_id) values (:'sid', 'Batata grátis', 50, 'product', :'batata') returning id as r_batata \gset
insert into loyalty_rewards (store_id, name, points_cost, kind, percent) values (:'sid', '20% de desconto', 80, 'percent', 20) returning id as r_pct \gset
insert into loyalty_rewards (store_id, name, points_cost, kind) values (:'sid', 'Sem produto', 10, 'product');  -- ERRO (falta o produto)

reset role; set role anon; set request.jwt.claim.sub = '';
\set ana '{"fulfillment":"pickup","customer_name":"Ana","customer_phone":"(11) 98888-7777","payment_method":"cash"}'
-- programa desligado
select loyalty_status(:'sid', null, '{}') as desligado;  -- enabled false
select place_order(:'sid', (:'ana'::jsonb) || jsonb_build_object('items', jsonb_build_array(jsonb_build_object('product_id', :'burger', 'quantity', 2)))) ->> 'token' as t1 \gset
reset role; update orders set status = 'delivered' where public_token = :'t1';
select count(*) as sem_pontos_com_programa_desligado from loyalty_ledger where store_id = :'sid';  -- 0

-- liga o programa (R$ 1 = 1 ponto)
update stores set loyalty_enabled = true where id = :'sid';
set role anon;
select place_order(:'sid', (:'ana'::jsonb) || jsonb_build_object('items', jsonb_build_array(jsonb_build_object('product_id', :'burger', 'quantity', 2)))) ->> 'token' as t2 \gset
reset role; update orders set status = 'preparing' where public_token = :'t2';
select count(*) as sem_pontos_antes_de_entregar from loyalty_ledger where store_id = :'sid';  -- 0
update orders set status = 'delivered' where public_token = :'t2';
select kind, points, expires_at::date - current_date as dias from loyalty_ledger where store_id = :'sid' order by kind;
-- earn 60 90 | welcome 10 90
update orders set status = 'delivered' where public_token = :'t2';  -- mudar de novo não dá pontos em dobro
select sum(points) as saldo_extrato from loyalty_ledger where store_id = :'sid';  -- 70

set role anon;
-- sem provar o celular: vê o programa, não vê o saldo
select (loyalty_status(:'sid', '11988887777', '{}') - 'rewards') as sem_prova;  -- verified false, points null
select loyalty_status(:'sid', '11988887777', array[:'t1']::uuid[]) -> 'points' ->> 'balance' as saldo;  -- 70
select loyalty_status(:'sid', null, array[:'t1']::uuid[]) ->> 'phone_end' as pelo_aparelho;  -- 7777
select loyalty_status(:'sid', '11900001111', array[:'t1']::uuid[]) ->> 'verified' as outro_celular;  -- false

-- trocar sem prova / sem pontos suficientes
select place_order(:'sid', (:'ana'::jsonb) || jsonb_build_object('loyalty_reward_id', :'r_batata', 'items', jsonb_build_array(jsonb_build_object('product_id', :'burger')))) ;  -- ERRO pontos_sem_acesso
select place_order(:'sid', (:'ana'::jsonb) || jsonb_build_object('loyalty_reward_id', :'r_pct', 'loyalty_tokens', jsonb_build_array(:'t1'), 'items', jsonb_build_array(jsonb_build_object('product_id', :'burger')))) ;  -- ERRO pontos_insuficientes (70 < 80)
select place_order(:'sid', (:'ana'::jsonb) || jsonb_build_object('loyalty_reward_id', 'abc', 'items', jsonb_build_array(jsonb_build_object('product_id', :'burger')))) ;  -- ERRO recompensa_invalida

-- troca batata grátis (50): entra no pedido com preço zero
select place_order(:'sid', (:'ana'::jsonb) || jsonb_build_object('loyalty_reward_id', :'r_batata', 'loyalty_tokens', jsonb_build_array(:'t1'), 'items', jsonb_build_array(jsonb_build_object('product_id', :'burger')))) as r3 \gset
select :'r3'::jsonb ->> 'total_cents' as total_com_brinde;  -- 3000
select loyalty_status(:'sid', '11988887777', array[:'t1']::uuid[]) -> 'points' ->> 'balance' as saldo_depois;  -- 20
reset role;
select product_name, unit_price_cents, notes from order_items where order_id = (:'r3'::jsonb->>'id')::uuid order by sort_order;
-- X-Burger 3000 | Batata 0 Brinde da fidelidade
select loyalty_reward_name, loyalty_points_used from orders where id = (:'r3'::jsonb->>'id')::uuid;  -- Batata grátis | 50
-- cancelado: devolve os pontos
update orders set status = 'cancelled' where id = (:'r3'::jsonb->>'id')::uuid;
select (loyalty_balance(:'sid', '11988887777') ->> 'balance') as devolvido;  -- 70

-- ganha mais e troca 20% (80)
set role anon;
select place_order(:'sid', (:'ana'::jsonb) || jsonb_build_object('items', jsonb_build_array(jsonb_build_object('product_id', :'burger')))) ->> 'token' as t4 \gset
reset role; update orders set status = 'delivered' where public_token = :'t4';
select (loyalty_balance(:'sid', '11988887777') ->> 'balance') as saldo_100;  -- 100
set role anon;
select place_order(:'sid', (:'ana'::jsonb) || jsonb_build_object('change_for_cents', 10000, 'loyalty_reward_id', :'r_pct', 'loyalty_tokens', jsonb_build_array(:'t4'), 'items', jsonb_build_array(jsonb_build_object('product_id', :'burger', 'quantity', 2)))) as r5 \gset
reset role;
select subtotal_cents, discount_cents, total_cents from orders where id = (:'r5'::jsonb->>'id')::uuid;  -- 6000 1200 4800
select (loyalty_balance(:'sid', '11988887777') ->> 'balance') as saldo_20;  -- 20
-- ao entregar o pedido com desconto, ganha pontos sobre o valor com desconto (48)
update orders set status = 'delivered' where id = (:'r5'::jsonb->>'id')::uuid;
select (loyalty_balance(:'sid', '11988887777') ->> 'balance') as saldo_68;  -- 68

-- pontos vencidos não contam (e trocas antigas gastam primeiro os mais velhos)
update loyalty_ledger set expires_at = now() - interval '1 day', created_at = now() - interval '100 days' where order_id = (select id from orders where public_token = :'t2');
select loyalty_balance(:'sid', '11988887777') as depois_de_vencer;
-- 48: os pontos do pedido 2 venceram e a troca de 80 já tinha gastado os 30 do pedido 4; sobra o pedido 5

-- painel
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select phone, name, balance, next_reward, missing, can_redeem from loyalty_customers(:'sid');
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select * from loyalty_customers(:'sid');  -- ERRO sem permissão
select count(*) as extrato_de_outra_loja from loyalty_ledger where store_id = :'sid';  -- 0
insert into loyalty_rewards (store_id, name, points_cost, kind, percent) values (:'sid', 'Hack', 1, 'percent', 100);  -- ERRO (RLS)
set role anon;
insert into loyalty_ledger (store_id, phone, points, kind, expires_at) values (:'sid', '11988887777', 9999, 'earn', now() + interval '1 year');  -- ERRO (sem permissão)
select count(*) as core_bloqueado from place_order_core(:'sid', '{}'::jsonb);  -- ERRO sem permissão
reset role;
