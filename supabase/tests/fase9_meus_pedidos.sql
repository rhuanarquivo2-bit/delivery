\set ON_ERROR_STOP 0
-- Fase 9: "Meus pedidos" (lista pelo aparelho e senha para outro aparelho).
reset role;
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into stores (slug, name, open_override) values ('pedidos9', 'Loja Pedidos', true) returning id as sid \gset
insert into stores (slug, name, open_override) values ('outra9', 'Outra', true) returning id as outra \gset
select save_category(:'sid', '{"name":"Lanches","has_sizes":false,"sizes":[],"groups":[]}') as cat \gset
select save_product(:'sid', jsonb_build_object('category_id',:'cat','name','X-Burger','price_cents',3000)) as burger \gset

reset role; set role anon; set request.jwt.claim.sub = '';
\set bia '{"fulfillment":"pickup","customer_name":"Bia","customer_phone":"(31) 98234-6027","payment_method":"cash"}'
select place_order(:'sid', (:'bia'::jsonb) || jsonb_build_object('items', jsonb_build_array(jsonb_build_object('product_id', :'burger', 'quantity', 2))))->>'token' as t1 \gset
select place_order(:'sid', (:'bia'::jsonb) || jsonb_build_object('items', jsonb_build_array(jsonb_build_object('product_id', :'burger'))))->>'token' as t2 \gset
select place_order(:'sid', '{"fulfillment":"pickup","customer_name":"Caio","customer_phone":"31911112222","payment_method":"cash"}'::jsonb || jsonb_build_object('items', jsonb_build_array(jsonb_build_object('product_id', :'burger'))))->>'token' as t3 \gset

-- tabela fechada para o público
select count(*) as tabela_fechada from customer_pins;  -- 0 (sem regra de leitura: a tabela aparece vazia)

-- lista do aparelho: só os tokens informados, só desta loja, mais novo primeiro
select jsonb_array_length(orders_by_tokens(:'sid', array[:'t1', :'t2']::uuid[])) as do_aparelho;  -- 2
select orders_by_tokens(:'sid', array[:'t1', :'t2']::uuid[]) -> 0 ->> 'number' as mais_novo;  -- 2
select orders_by_tokens(:'sid', array[:'t1']::uuid[]) -> 0 -> 'items' as itens;  -- ["2x X-Burger"]
select jsonb_array_length(orders_by_tokens(:'outra', array[:'t1']::uuid[])) as outra_loja;  -- 0
select jsonb_array_length(orders_by_tokens(:'sid', array[gen_random_uuid()])) as token_inventado;  -- 0

-- sem senha ainda
select customer_pin_status(:'t1') as status_sem_senha;  -- has_pin false, phone_end 6027
select customer_orders_login(:'sid', '31982346027', '1357') as login_sem_senha;  -- sem_senha

-- criar senha: formato e senhas fáceis recusados
select set_customer_pin(:'t1', '12');  -- ERRO senha_invalida
select set_customer_pin(:'t1', '1234');  -- ERRO senha_fraca
select set_customer_pin(gen_random_uuid(), '1357');  -- ERRO pedido_nao_encontrado
select set_customer_pin(:'t1', '1357') as senha_criada;  -- t
select customer_pin_status(:'t2') ->> 'has_pin' as outro_pedido_mesmo_celular;  -- true
select customer_pin_status(:'t3') ->> 'has_pin' as outro_cliente;  -- false

-- entrar em outro aparelho
select jsonb_array_length(customer_orders_login(:'sid', '(31) 98234-6027', '1357') -> 'orders') as login_ok;  -- 2
select customer_orders_login(:'outra', '31982346027', '1357') ->> 'error' as outra_loja;  -- sem_senha
select customer_orders_login(:'sid', '31982346027', '9999') as erro1;  -- senha_incorreta, left 4
select customer_orders_login(:'sid', '31982346027', '9998') ->> 'left' as erro2;  -- 3
select customer_orders_login(:'sid', '31982346027', '9997') ->> 'left' as erro3;  -- 2
select customer_orders_login(:'sid', '31982346027', '9996') ->> 'left' as erro4;  -- 1
select customer_orders_login(:'sid', '31982346027', '9995') as erro5_bloqueia;  -- bloqueado, 15 min
select customer_orders_login(:'sid', '31982346027', '1357') ->> 'error' as bloqueado_mesmo_com_senha_certa;  -- bloqueado
reset role;
select failed_attempts, locked_until > now() + interval '14 minutes' as bloqueio_15min, pin_hash <> '1357' as senha_nao_guardada_aberta
from customer_pins where store_id = :'sid';
-- 5 | t | t
-- passa o bloqueio: 5 erros de novo dobram o tempo
update customer_pins set locked_until = now() - interval '1 second' where store_id = :'sid';
set role anon;
select customer_orders_login(:'sid', '31982346027', '0001') ->> 'left' as depois_do_bloqueio;  -- 4
select customer_orders_login(:'sid', '31982346027', '0002'), customer_orders_login(:'sid', '31982346027', '0003'), customer_orders_login(:'sid', '31982346027', '0004') \gset x
select customer_orders_login(:'sid', '31982346027', '0005') ->> 'minutes' as segundo_bloqueio;  -- 30
-- trocar a senha (com o link do pedido) libera o número
select set_customer_pin(:'t2', '8642') as trocou;
select jsonb_array_length(customer_orders_login(:'sid', '31982346027', '8642') -> 'orders') as nova_senha_ok;  -- 2
select customer_orders_login(:'sid', '31982346027', '1357') ->> 'error' as senha_antiga;  -- senha_incorreta
reset role;
