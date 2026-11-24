\set ON_ERROR_STOP 1
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into stores (slug, name, description, whatsapp, phone, address_street, address_number, address_district, address_city, address_state, primary_color, min_order_cents, prep_time_minutes, open_override)
values ('pizzaria-do-joao', 'Pizzaria do João', 'Pizzas artesanais no forno a lenha desde 2010.', '11999998888', '1133334444', 'Rua das Flores', '120', 'Centro', 'São Paulo', 'SP', '#D62828', 3000, 45, true)
returning id as sid \gset
select replace_delivery_zones(:'sid', '[{"neighborhood":"Centro","fee_cents":500,"active":true,"sort_order":0},{"neighborhood":"Jardim América","fee_cents":750,"active":true,"sort_order":1},{"neighborhood":"Vila Nova","fee_cents":0,"active":true,"sort_order":2}]');
select replace_store_hours(:'sid', '[{"weekday":0,"opens_at":"18:00","closes_at":"23:30"},{"weekday":5,"opens_at":"18:00","closes_at":"02:00"},{"weekday":6,"opens_at":"18:00","closes_at":"02:00"}]');

select save_category(:'sid', '{"name":"Pizzas","description":"Massa de fermentação natural, 48h.","has_sizes":true,"half_price_rule":"highest","sizes":[{"name":"Broto","max_flavors":1},{"name":"Média","max_flavors":2},{"name":"Grande","max_flavors":2}],"groups":[{"name":"Borda recheada","min_select":0,"max_select":1,"options":[{"name":"Catupiry","price_cents":800},{"name":"Cheddar","price_cents":800},{"name":"Chocolate","price_cents":1000}]}]}') as pizzas \gset
select id as broto from category_sizes where category_id = :'pizzas' and name = 'Broto' \gset
select id as media from category_sizes where category_id = :'pizzas' and name = 'Média' \gset
select id as grande from category_sizes where category_id = :'pizzas' and name = 'Grande' \gset
select save_product(:'sid', jsonb_build_object('category_id', :'pizzas', 'name', 'Calabresa', 'description', 'Molho de tomate, mussarela, calabresa fatiada e cebola.', 'prices', jsonb_build_array(jsonb_build_object('size_id', :'broto', 'price_cents', 3290), jsonb_build_object('size_id', :'media', 'price_cents', 4490), jsonb_build_object('size_id', :'grande', 'price_cents', 5490))));
select save_product(:'sid', jsonb_build_object('category_id', :'pizzas', 'name', 'Margherita', 'description', 'Molho de tomate, mussarela de búfala, tomate e manjericão.', 'prices', jsonb_build_array(jsonb_build_object('size_id', :'broto', 'price_cents', 3490), jsonb_build_object('size_id', :'media', 'price_cents', 4790), jsonb_build_object('size_id', :'grande', 'price_cents', 5890))));
select save_product(:'sid', jsonb_build_object('category_id', :'pizzas', 'name', 'Portuguesa', 'description', 'Presunto, ovos, cebola, ervilha, azeitona e mussarela.', 'prices', jsonb_build_array(jsonb_build_object('size_id', :'media', 'price_cents', 4990), jsonb_build_object('size_id', :'grande', 'price_cents', 5990))));
select save_product(:'sid', jsonb_build_object('category_id', :'pizzas', 'name', 'Frango com Catupiry', 'description', 'Frango desfiado temperado e Catupiry original.', 'prices', jsonb_build_array(jsonb_build_object('size_id', :'broto', 'price_cents', 3490), jsonb_build_object('size_id', :'media', 'price_cents', 4790), jsonb_build_object('size_id', :'grande', 'price_cents', 5790))));

select save_category(:'sid', '{"name":"Lanches","has_sizes":false,"sizes":[],"groups":[{"name":"Ponto da carne","min_select":1,"max_select":1,"options":[{"name":"Mal passado","price_cents":0},{"name":"Ao ponto","price_cents":0},{"name":"Bem passado","price_cents":0}]},{"name":"Adicionais","min_select":0,"max_select":3,"options":[{"name":"Bacon","price_cents":500},{"name":"Ovo","price_cents":300},{"name":"Cheddar extra","price_cents":400}]}]}') as lanches \gset
select save_product(:'sid', jsonb_build_object('category_id', :'lanches', 'name', 'X-Burger da Casa', 'description', 'Pão brioche, blend 180g, queijo prato, alface, tomate e molho especial.', 'price_cents', 3290));
select save_product(:'sid', jsonb_build_object('category_id', :'lanches', 'name', 'X-Bacon', 'description', 'Pão brioche, blend 180g, muito bacon e cheddar.', 'price_cents', 3690));

select save_category(:'sid', '{"name":"Bebidas","has_sizes":false,"sizes":[],"groups":[]}') as bebidas \gset
select save_product(:'sid', jsonb_build_object('category_id', :'bebidas', 'name', 'Coca-Cola 2L', 'price_cents', 1490));
select save_product(:'sid', jsonb_build_object('category_id', :'bebidas', 'name', 'Guaraná Antarctica lata', 'price_cents', 650));
select save_product(:'sid', jsonb_build_object('category_id', :'bebidas', 'name', 'Suco natural de laranja 500ml', 'price_cents', 1200, 'active', false));

-- Fase 3: promoções e cupons de exemplo
insert into promotions (store_id, name, kind, value, product_id)
  select :'sid', 'Calabresa da semana', 'percent', 20, id from products where store_id = :'sid' and name = 'Calabresa';
insert into promotions (store_id, name, kind, value, category_id, weekdays, start_time, end_time)
  values (:'sid', 'Happy hour do burger', 'fixed', 500, :'lanches', array[2,3,4]::smallint[], '18:00', '20:00');
insert into coupons (store_id, code, description, kind, value, first_order_only)
  values (:'sid', 'BEMVINDO', '10% no seu primeiro pedido', 'percent', 10, true);
insert into coupons (store_id, code, description, kind, min_order_cents)
  values (:'sid', 'FRETEGRATIS', 'Entrega grátis acima de R$ 60', 'free_delivery', 6000);
