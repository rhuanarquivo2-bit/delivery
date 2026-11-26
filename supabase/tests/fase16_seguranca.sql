\set ON_ERROR_STOP 0
-- Fase 16: reforço de segurança.
reset role;
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into stores (slug, name, open_override) values ('seguranca16', 'Loja Segura', true) returning id as sid \gset
select save_category(:'sid', '{"name":"Lanches","has_sizes":false,"sizes":[],"groups":[]}') as cat \gset
select save_product(:'sid', jsonb_build_object('category_id',:'cat','name','X-Burger','price_cents',3000)) as burger \gset

reset role; set role anon; set request.jwt.claim.sub = '';
\set pedido '{"fulfillment":"pickup","customer_name":"Bia Lima","customer_phone":"11977776666","payment_method":"cash"}'
select place_order(:'sid', (:'pedido'::jsonb) || jsonb_build_object('items', jsonb_build_array(jsonb_build_object('product_id', :'burger')))) ->> 'token' as tok \gset

-- 1. sem o link do pedido, o celular não revela nome/endereço
select count(*) as sem_link from customer_lookup(:'sid', '11977776666', '{}'::uuid[]);  -- 0
select count(*) as link_de_outro from customer_lookup(:'sid', '11977776666', array[gen_random_uuid()]);  -- 0
select name as com_link from customer_lookup(:'sid', '11977776666', array[:'tok']::uuid[]);  -- Bia Lima
select customer_lookup(:'sid', '11977776666');  -- ERROR: função antiga não existe mais

-- 2. funções internas não podem ser chamadas pela internet
select loyalty_balance(:'sid', '11977776666');  -- ERROR: permission denied
select loyalty_owner_phone(:'sid', '11977776666', array[:'tok']::uuid[]);  -- ERROR: permission denied
select admin_list_stores();  -- ERROR: permission denied

-- 5. limite: 8 pedidos do mesmo celular em 10 minutos (já fez 1)
select place_order(:'sid', (:'pedido'::jsonb) || jsonb_build_object('items', jsonb_build_array(jsonb_build_object('product_id', :'burger')))) ->> 'number' as n2;
select place_order(:'sid', (:'pedido'::jsonb) || jsonb_build_object('items', jsonb_build_array(jsonb_build_object('product_id', :'burger')))) ->> 'number' as n3;
select place_order(:'sid', (:'pedido'::jsonb) || jsonb_build_object('items', jsonb_build_array(jsonb_build_object('product_id', :'burger')))) ->> 'number' as n4;
select place_order(:'sid', (:'pedido'::jsonb) || jsonb_build_object('items', jsonb_build_array(jsonb_build_object('product_id', :'burger')))) ->> 'number' as n5;
select place_order(:'sid', (:'pedido'::jsonb) || jsonb_build_object('items', jsonb_build_array(jsonb_build_object('product_id', :'burger')))) ->> 'number' as n6;
select place_order(:'sid', (:'pedido'::jsonb) || jsonb_build_object('items', jsonb_build_array(jsonb_build_object('product_id', :'burger')))) ->> 'number' as n7;
select place_order(:'sid', (:'pedido'::jsonb) || jsonb_build_object('items', jsonb_build_array(jsonb_build_object('product_id', :'burger')))) ->> 'number' as n8;
select place_order(:'sid', (:'pedido'::jsonb) || jsonb_build_object('items', jsonb_build_array(jsonb_build_object('product_id', :'burger')))) ->> 'number' as n9;  -- ERROR: muitos_pedidos
-- outro celular continua pedindo
select place_order(:'sid', (:'pedido'::jsonb) || '{"customer_phone":"11955554444"}'::jsonb || jsonb_build_object('items', jsonb_build_array(jsonb_build_object('product_id', :'burger')))) ->> 'number' as outro_celular;  -- 9

-- a equipe da loja (logada, testando) não tem limite
reset role; set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select place_order(:'sid', (:'pedido'::jsonb) || jsonb_build_object('items', jsonb_build_array(jsonb_build_object('product_id', :'burger')))) ->> 'number' as equipe;  -- 10

-- 3. visitante anônimo (demonstração) não cria loja de verdade
reset role; set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set request.jwt.claims = '{"is_anonymous": true}';
insert into stores (slug, name) values ('anonima16', 'Loja Anônima');  -- ERROR: row-level security
set request.jwt.claims = '{"is_anonymous": false}';
insert into stores (slug, name) values ('normal16', 'Loja Normal') returning slug as criada;  -- normal16
reset request.jwt.claims;

-- 6. leitura por foto: 20 por dia
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select count(*) filter (where consume_demo_ai_read(:'sid')) as liberadas from generate_series(1, 22);  -- 20
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select consume_demo_ai_read(:'sid');  -- ERROR: sem permissão (não é da loja)
reset role;
