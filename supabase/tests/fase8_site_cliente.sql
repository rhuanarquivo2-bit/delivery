\set ON_ERROR_STOP 0
-- Fase 8: selo "mais pedido" e dados do cliente pelo celular.
reset role;
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into stores (slug, name, open_override) values ('cliente8', 'Loja Cliente', true) returning id as sid \gset
select save_category(:'sid', '{"name":"Lanches","has_sizes":false,"sizes":[],"groups":[]}') as cat \gset
select save_product(:'sid', jsonb_build_object('category_id',:'cat','name','X-Burger','price_cents',3000)) as burger \gset
select save_product(:'sid', jsonb_build_object('category_id',:'cat','name','X-Salada','price_cents',3200)) as salada \gset
select save_product(:'sid', jsonb_build_object('category_id',:'cat','name','Suco','price_cents',800)) as suco \gset
insert into delivery_zones (store_id, neighborhood, fee_cents) values (:'sid','Centro',500) returning id as zona \gset

reset role; set role anon; set request.jwt.claim.sub = '';
-- loja sem vendas: ninguém ganha o selo
select count(*) as mais_pedidos_loja_nova from best_sellers(:'sid');  -- 0

\set ana '{"fulfillment":"delivery","customer_name":"Ana Souza","customer_phone":"(11) 98888-7777","address_street":"Rua das Flores","address_number":"12","address_complement":"apto 3","address_reference":"perto da praça","address_zip":"01310-100","payment_method":"cash"}'
select place_order(:'sid', (:'ana'::jsonb) || jsonb_build_object('delivery_zone_id', :'zona', 'items', jsonb_build_array(jsonb_build_object('product_id', :'burger', 'quantity', 4), jsonb_build_object('product_id', :'suco')))) ->> 'number' as p1;
select place_order(:'sid', (:'ana'::jsonb) || jsonb_build_object('delivery_zone_id', :'zona', 'items', jsonb_build_array(jsonb_build_object('product_id', :'burger', 'quantity', 2), jsonb_build_object('product_id', :'salada', 'quantity', 6)))) ->> 'number' as p2;
-- depois a Ana retira na loja com outro nome: o endereço continua o da última entrega
select place_order(:'sid', '{"fulfillment":"pickup","customer_name":"Ana S.","customer_phone":"11988887777","payment_method":"cash"}'::jsonb || jsonb_build_object('items', jsonb_build_array(jsonb_build_object('product_id', :'suco')))) ->> 'number' as p3;

-- mais pedidos: salada (6), burger (6, em 2 pedidos) -> burger primeiro; suco só tem 2 (abaixo do mínimo)
select array_agg(p.name order by r.ord) as mais_pedidos
from best_sellers(:'sid') with ordinality r(id, ord) join products p on p.id = r.id;
-- {X-Burger,X-Salada}
select count(*) as limite_1 from best_sellers(:'sid', 1);  -- 1

-- pedido cancelado não conta
reset role;
update orders set status = 'cancelled' where store_id = :'sid' and number = 2;
set role anon;
select array_agg(p.name) as mais_pedidos_sem_cancelado
from best_sellers(:'sid') r(id) join products p on p.id = r.id;
-- vazio: sem o pedido 2, o burger fica com 4 unidades (abaixo do mínimo de 5) e a salada com 0

-- cliente pelo celular (com ou sem máscara)
select name, street, number, complement, reference, delivery_zone_id = :'zona' as zona_ok, zip, orders
from customer_lookup(:'sid', '(11) 98888-7777');
-- Ana S. | Rua das Flores | 12 | apto 3 | perto da praça | t | 01310100 | 2
select count(*) as numero_desconhecido from customer_lookup(:'sid', '11900001111');  -- 0
select count(*) as numero_curto from customer_lookup(:'sid', '9888');  -- 0
select count(*) as numero_vazio from customer_lookup(:'sid', null);  -- 0

-- outra loja não enxerga os clientes desta
reset role; set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into stores (slug, name) values ('outra8', 'Outra Loja') returning id as outra \gset
reset role; set role anon;
select count(*) as outra_loja from customer_lookup(:'outra', '11988887777');  -- 0
select count(*) as outra_loja_mais_pedidos from best_sellers(:'outra');  -- 0
reset role;
