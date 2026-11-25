\set ON_ERROR_STOP 0
-- Fase 14: teste grátis x pagante e apagar loja. Usuário 1 = lojista, 2 = administrador (fase 13).
reset role; set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into stores (slug, name, open_override) values ('teste14', 'Loja Teste', true) returning id as sid \gset
select paid as comeca_em_teste from stores where id = :'sid';  -- f
update stores set paid = true where id = :'sid';  -- ERRO acesso_somente_admin
select admin_set_store_paid(:'sid', true);  -- ERRO sem permissão
select admin_delete_store(:'sid', 'teste14');  -- ERRO sem permissão
select save_category(:'sid', '{"name":"Lanches","has_sizes":false,"sizes":[],"groups":[]}') as cat \gset
select save_product(:'sid', jsonb_build_object('category_id',:'cat','name','X-Burger','price_cents',3000)) as burger \gset
reset role; set role anon; set request.jwt.claim.sub = '';
select place_order(:'sid', '{"fulfillment":"pickup","customer_name":"Bia","customer_phone":"(31) 98234-6027","payment_method":"cash"}'::jsonb || jsonb_build_object('items', jsonb_build_array(jsonb_build_object('product_id', :'burger'))))->>'number' as pedido;  -- 1

reset role; set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select paid from admin_list_stores() where id = :'sid';  -- f
select admin_extend_store(:'sid', 30) is not null as estendeu;
select paid as virou_pagante from admin_list_stores() where id = :'sid';  -- t
select admin_set_store_paid(:'sid', false);
select paid as voltou_teste from stores where id = :'sid';  -- f
select admin_set_store_until(:'sid', null);
select paid as sem_prazo_pagante from stores where id = :'sid';  -- t

-- apagar: só com o endereço certo
select admin_delete_store(:'sid', 'outra-loja');  -- ERRO confirmacao_invalida
select admin_delete_store(:'sid', '  TESTE14 ');
reset role;
select count(*) as loja_apagada from stores where id = :'sid';  -- 0
select count(*) as pedidos_apagados from orders where store_id = :'sid';  -- 0
select count(*) as produtos_apagados from products where store_id = :'sid';  -- 0
