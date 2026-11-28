\set ON_ERROR_STOP 0
-- Fase 19: escolha de sabor dentro do produto (ex.: Refrigerante Lata). Usuário 1 = lojista.
reset role; set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into stores (slug, name, open_override) values ('teste19', 'Cozinha Bebidas', true) returning id as sid \gset
-- categoria com um adicional que vale para todos (gelo)
select save_category(:'sid', '{"name":"Bebidas","has_sizes":false,"sizes":[],"groups":[{"name":"Extras","min_select":0,"max_select":1,"options":[{"name":"Copo com gelo","price_cents":100}]}]}') as cat \gset
select id as gelo from options where name = 'Copo com gelo' \gset
select save_product(:'sid', jsonb_build_object('category_id',:'cat','name','Refrigerante Lata','price_cents',700,
  'groups', '[{"name":"Sabor","min_select":1,"max_select":1,"options":[
    {"name":"Coca-Cola","price_cents":0},{"name":"Guaraná","price_cents":0},
    {"name":"Coca Zero","price_cents":50},{"name":"Fanta Laranja","price_cents":0,"active":false}]}]'::jsonb)) as lata \gset
select save_product(:'sid', jsonb_build_object('category_id',:'cat','name','Água','price_cents',350)) as agua \gset
select id as sabor from option_groups where product_id = :'lata' \gset
select id as coca from options where name = 'Coca-Cola' \gset
select id as zero from options where name = 'Coca Zero' \gset
select id as fanta from options where name = 'Fanta Laranja' \gset

select name, product_id is not null as do_produto, category_id = :'cat' as mesma_categoria
  from option_groups where store_id = :'sid' order by product_id nulls first;
-- Extras | f | t
-- Sabor  | t | t

-- re-salvar a categoria não apaga o sabor do produto
select save_category(:'sid', jsonb_build_object('id',:'cat','name','Bebidas','has_sizes',false,'sizes','[]'::jsonb,
  'groups', jsonb_build_array(jsonb_build_object('id',(select id from option_groups where store_id=:'sid' and product_id is null),
    'name','Extras','min_select',0,'max_select',1,'options',jsonb_build_array(jsonb_build_object('id',:'gelo','name','Copo com gelo','price_cents',100))))));
select count(*) as sabor_continua from option_groups where id = :'sabor';  -- 1
-- salvar o produto sem "groups" (importação, demonstração) não mexe no sabor
select save_product(:'sid', jsonb_build_object('id',:'lata','category_id',:'cat','name','Refrigerante Lata','price_cents',700)) is not null;
select count(*) as opcoes_continuam from options where group_id = :'sabor';  -- 4
-- outro lojista não mexe
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select save_product(:'sid', jsonb_build_object('id',:'lata','category_id',:'cat','name','X','price_cents',1,'groups','[]'::jsonb));  -- ERRO sem permissão
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

-- cliente
reset role; set role anon; set request.jwt.claim.sub = '';
\set pedido '{"fulfillment":"pickup","customer_name":"Ana","customer_phone":"31982347001","payment_method":"cash"}'
-- sem escolher o sabor
select place_order(:'sid', (:'pedido'::jsonb) || jsonb_build_object('items', jsonb_build_array(jsonb_build_object('product_id',:'lata'))));  -- ERRO adicionais_invalidos
-- dois sabores numa lata
select place_order(:'sid', (:'pedido'::jsonb) || jsonb_build_object('items', jsonb_build_array(jsonb_build_object('product_id',:'lata','option_ids',jsonb_build_array(:'coca',:'zero')))));  -- ERRO adicionais_invalidos
-- sabor pausado (acabou)
select place_order(:'sid', (:'pedido'::jsonb) || jsonb_build_object('items', jsonb_build_array(jsonb_build_object('product_id',:'lata','option_ids',jsonb_build_array(:'fanta')))));  -- ERRO adicional_indisponivel
-- sabor da lata na água não vale
select place_order(:'sid', (:'pedido'::jsonb) || jsonb_build_object('items', jsonb_build_array(jsonb_build_object('product_id',:'agua','option_ids',jsonb_build_array(:'coca')))));  -- ERRO adicional_indisponivel
-- certo: 2 Coca Zero com gelo + 1 água sem nada (água não exige sabor)
select place_order(:'sid', (:'pedido'::jsonb) || jsonb_build_object('items', jsonb_build_array(
  jsonb_build_object('product_id',:'lata','option_ids',jsonb_build_array(:'gelo',:'zero'),'quantity',2),
  jsonb_build_object('product_id',:'agua')))) as r \gset

reset role;
select product_name, options, unit_price_cents, total_cents from order_items where store_id = :'sid' order by sort_order;
-- Refrigerante Lata | [{"name": "Coca Zero", "group": "Sabor", "choice": true, "price_cents": 50}, {"name": "Copo com gelo", "group": "Extras", "price_cents": 100}] | 850 | 1700
-- Água | [] | 350 | 350
select total_cents from orders where id = (:'r'::jsonb->>'id')::uuid;  -- 2050

-- cozinha: sabor separado dos adicionais
select i->>'product_name' as item, i->'choices' as escolhas, i->'options' as adicionais
  from orders o, jsonb_array_elements(kitchen_order_json(o)->'items') i where o.store_id = :'sid';
-- Refrigerante Lata | ["Coca Zero"] | ["Copo com gelo"]
-- Água | [] | []

-- produto muda de categoria: o sabor vai junto
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select save_category(:'sid', '{"name":"Refrigerantes","has_sizes":false,"sizes":[],"groups":[]}') as cat2 \gset
select save_product(:'sid', jsonb_build_object('id',:'lata','category_id',:'cat2','name','Refrigerante Lata','price_cents',700)) is not null;
select category_id = :'cat2' as sabor_mudou_junto from option_groups where id = :'sabor';  -- t
-- remover o grupo pelo produto
select save_product(:'sid', jsonb_build_object('id',:'lata','category_id',:'cat2','name','Refrigerante Lata','price_cents',700,'groups','[]'::jsonb)) is not null;
select count(*) as sem_grupo from option_groups where product_id = :'lata';  -- 0
-- apagar o produto apaga o grupo
select save_product(:'sid', jsonb_build_object('category_id',:'cat2','name','Suco','price_cents',1000,
  'groups','[{"name":"Sabor","min_select":1,"max_select":1,"options":[{"name":"Laranja","price_cents":0}]}]'::jsonb)) as suco \gset
delete from products where id = :'suco';
select count(*) as grupo_apagado from option_groups where product_id = :'suco';  -- 0
