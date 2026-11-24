\set ON_ERROR_STOP 0
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into stores (slug, name, min_order_cents) values ('pizzaria2', 'Pizzaria Dois', 2000) returning id as sid \gset
select save_category(:'sid', '{"name":"Pizzas","has_sizes":true,"half_price_rule":"highest","sizes":[{"name":"Broto","max_flavors":1},{"name":"Grande","max_flavors":2}],"groups":[{"name":"Borda","min_select":0,"max_select":1,"options":[{"name":"Catupiry","price_cents":800},{"name":"Cheddar","price_cents":900}]}]}') as cat \gset
select id as broto from category_sizes where category_id=:'cat' and name='Broto' \gset
select id as grande from category_sizes where category_id=:'cat' and name='Grande' \gset
select save_product(:'sid', jsonb_build_object('category_id',:'cat','name','Calabresa','prices',jsonb_build_array(jsonb_build_object('size_id',:'broto','price_cents',3000),jsonb_build_object('size_id',:'grande','price_cents',5000)))) as calab \gset
select save_product(:'sid', jsonb_build_object('category_id',:'cat','name','Portuguesa','prices',jsonb_build_array(jsonb_build_object('size_id',:'grande','price_cents',6000)))) as port \gset
select id as catupiry from options where name='Catupiry' \gset
select id as cheddar from options where name='Cheddar' \gset
select id as cheddar from options where name='Cheddar' \gset
-- re-salvar categoria mantendo ids (tamanho Broto removido)
select save_category(:'sid', jsonb_build_object('id',:'cat','name','Pizzas','has_sizes',true,'sizes',jsonb_build_array(jsonb_build_object('id',:'grande','name','Grande','max_flavors',2)),'groups',jsonb_build_array(jsonb_build_object('name','Borda','min_select',0,'max_select',1,'options',jsonb_build_array(jsonb_build_object('id',:'catupiry','name','Catupiry','price_cents',800),jsonb_build_object('id',:'cheddar','name','Cheddar','price_cents',900)))))) ;
select count(*) as precos_restantes from product_prices;  -- 2 (só grande)
select id as borda from option_groups where category_id=:'cat' \gset
select count(*) grupos from option_groups; 
select id as catupiry from options where name='Catupiry' \gset
select id as cheddar from options where name='Cheddar' \gset
insert into delivery_zones (store_id, neighborhood, fee_cents) values (:'sid','Centro',500) returning id as zona \gset
-- anônimo
reset role; set role anon; set request.jwt.claim.sub = '';
\set pedido '{"fulfillment":"delivery","customer_name":"Maria","customer_phone":"(11) 98888-7777","address_street":"Rua A","address_number":"10","payment_method":"cash","change_for_cents":10000}'
select place_order(:'sid', (:'pedido'::jsonb) || jsonb_build_object('delivery_zone_id',:'zona','items','[]'::jsonb));  -- loja fechada
reset role; update stores set open_override = true where id = :'sid'; set role anon;
select place_order(:'sid', (:'pedido'::jsonb) || jsonb_build_object('delivery_zone_id',:'zona','items','[]'::jsonb));  -- carrinho vazio
-- meio a meio calabresa/portuguesa grande + catupiry x2 => (6000+800)*2 = 13600 + 500 = 14100 > troco 10000 -> troco_invalido
select place_order(:'sid', (:'pedido'::jsonb) || jsonb_build_object('delivery_zone_id',:'zona','items',jsonb_build_array(jsonb_build_object('product_id',:'calab','size_id',:'grande','flavor_ids',jsonb_build_array(:'port'),'option_ids',jsonb_build_array(:'catupiry'),'quantity',2))));
select place_order(:'sid', (:'pedido'::jsonb) || jsonb_build_object('change_for_cents',20000,'delivery_zone_id',:'zona','items',jsonb_build_array(jsonb_build_object('product_id',:'calab','size_id',:'grande','flavor_ids',jsonb_build_array(:'port'),'option_ids',jsonb_build_array(:'catupiry'),'quantity',2,'notes','sem cebola')))) as r \gset
\echo :r
-- dois adicionais no grupo max 1
select place_order(:'sid', (:'pedido'::jsonb) || jsonb_build_object('change_for_cents',null,'delivery_zone_id',:'zona','items',jsonb_build_array(jsonb_build_object('product_id',:'calab','size_id',:'grande','option_ids',jsonb_build_array(:'catupiry',:'cheddar')))));
-- pedido mínimo: produto sozinho grande calabresa 5000 ok; pix_online bloqueado
select place_order(:'sid', (:'pedido'::jsonb) || jsonb_build_object('payment_method','pix_online','delivery_zone_id',:'zona','items',jsonb_build_array(jsonb_build_object('product_id',:'calab','size_id',:'grande')))) ;
-- retirada, cartao
select place_order(:'sid', '{"fulfillment":"pickup","customer_name":"Jo","customer_phone":"11988887777","payment_method":"card_delivery"}'::jsonb || jsonb_build_object('items',jsonb_build_array(jsonb_build_object('product_id',:'calab','size_id',:'grande')))) ->> 'number' as numero;
-- anon não lê pedidos
select count(*) from orders;
select (get_public_order((:'r'::jsonb->>'token')::uuid))->'items';
-- outro usuário não vê/alterar
reset role; set role authenticated; set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select count(*) as outro_ve from orders;
select save_category(:'sid', '{"name":"X"}');
-- dono muda status, não muda total
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update orders set status='preparing' where number=1 returning number, status, accepted_at is not null as aceito;
update orders set total_cents=1 where number=1;
select number, total_cents, subtotal_cents, delivery_fee_cents, change_for_cents, address_district from orders order by number;
