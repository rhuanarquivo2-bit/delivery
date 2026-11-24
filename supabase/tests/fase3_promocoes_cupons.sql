\set ON_ERROR_STOP 0
-- Fase 3: promoções, cupons, prévia do checkout e importação do cardápio.
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into stores (slug, name, open_override) values ('burger3', 'Burger Três', true) returning id as sid \gset

-- importação: lanches (preço único) + pizzas (2 tamanhos) com bordas
select import_menu(:'sid', '{"categories":[
  {"name":"Lanches","has_sizes":false,"products":[
    {"name":"X-Burger","description":"Pão, carne e queijo","price_cents":2500},
    {"name":"X-Salada","price_cents":2800}]},
  {"name":"Pizzas","has_sizes":true,
   "sizes":[{"name":"Média","max_flavors":1},{"name":"Grande","max_flavors":2}],
   "groups":[{"name":"Bordas","options":[{"name":"Catupiry","price_cents":800}]}],
   "products":[{"name":"Mussarela","prices":[4000,5000]},{"name":"Calabresa","prices":[null,6000]}]}
]}'::jsonb) as importados;  -- 4
select c.name, c.has_sizes, (select count(*) from products p where p.category_id = c.id) produtos,
       (select string_agg(s.name || '/' || s.max_flavors, ', ' order by s.sort_order) from category_sizes s where s.category_id = c.id) tamanhos
  from categories c where store_id = :'sid' order by sort_order;
select p.name, p.price_cents, (select string_agg(pp.price_cents::text, ',' order by s.sort_order)
  from product_prices pp join category_sizes s on s.id = pp.size_id where pp.product_id = p.id) precos
  from products p where store_id = :'sid' order by p.name;
select id as xburger from products where store_id = :'sid' and name = 'X-Burger' \gset
select id as lanches from categories where store_id = :'sid' and name = 'Lanches' \gset
select id as pizzas from categories where store_id = :'sid' and name = 'Pizzas' \gset
select id as mussa from products where store_id = :'sid' and name = 'Mussarela' \gset
select id as calab from products where store_id = :'sid' and name = 'Calabresa' \gset
select id as grande from category_sizes where category_id = :'pizzas' and name = 'Grande' \gset

-- outro usuário não importa
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select import_menu(:'sid', '{"categories":[{"name":"X","products":[]}]}');  -- ERRO sem permissão
insert into promotions (store_id, name, kind, value, product_id) values (:'sid', 'Hack', 'percent', 90, :'xburger');  -- ERRO RLS
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

-- promoções: 20% no X-Burger todo dia; R$10 na Mussarela; uma fora do horário não vale
insert into promotions (store_id, name, kind, value, product_id) values (:'sid', 'Terça do burger', 'percent', 20, :'xburger');
insert into promotions (store_id, name, kind, value, product_id) values (:'sid', 'Mussarela barata', 'fixed', 1000, :'mussa');
insert into promotions (store_id, name, kind, value, category_id, starts_on, ends_on)
  values (:'sid', 'Já acabou', 'percent', 50, :'lanches', '2020-01-01', '2020-01-02');
insert into promotions (store_id, name, kind, value, category_id, weekdays)
  values (:'sid', 'Nunca hoje', 'percent', 50, :'lanches',
          array[((extract(dow from store_local_now())::int + 1) % 7)]::smallint[]);
insert into promotions (store_id, name, kind, value, product_id) values (:'sid', 'Inválida', 'percent', 95, :'xburger');  -- ERRO check

-- cupons
insert into coupons (store_id, code, kind, value, min_order_cents, max_discount_cents)
  values (:'sid', 'BEMVINDO', 'percent', 10, 3000, 1500);
insert into coupons (store_id, code, kind, value, usage_limit) values (:'sid', 'DEZ', 'fixed', 1000, 1);
insert into coupons (store_id, code, kind, first_order_only) values (:'sid', 'FRETE', 'free_delivery', true);
insert into coupons (store_id, code, kind, value, ends_at) values (:'sid', 'VELHO', 'fixed', 500, now() - interval '1 day');
insert into coupons (store_id, code, kind, value) values (:'sid', 'minusculo', 'fixed', 500);  -- ERRO check
insert into delivery_zones (store_id, neighborhood, fee_cents) values (:'sid', 'Centro', 700) returning id as zona \gset

-- cliente anônimo
reset role; set role anon; set request.jwt.claim.sub = '';
select count(*) as anon_ve_cupons from coupons;  -- ERRO permissão
select count(*) as anon_ve_promos from promotions;  -- 4 (ativas)

\set base '{"fulfillment":"delivery","customer_name":"Ana","customer_phone":"11977776666","address_street":"Rua B","address_number":"5","payment_method":"pix_delivery"}'
-- 2 X-Burger (2500 -20% = 2000) + Mussarela grande (5000-1000=4000) meio Calabresa (6000) -> regra maior: 6000
select quote_order(:'sid', jsonb_build_object('items', jsonb_build_array(
  jsonb_build_object('product_id', :'xburger', 'quantity', 2),
  jsonb_build_object('product_id', :'mussa', 'size_id', :'grande'),
  jsonb_build_object('product_id', :'mussa', 'size_id', :'grande', 'flavor_ids', jsonb_build_array(:'calab'))
))) as prévia;  -- subtotal 4000+4000+6000 = 14000, original 5000+5000+6000 = 16000, frete 0 (sem bairro)

select quote_order(:'sid', jsonb_build_object('coupon_code', ' bemvindo ', 'delivery_zone_id', :'zona', 'items',
  jsonb_build_array(jsonb_build_object('product_id', :'xburger', 'quantity', 2)))) as cupom_ok;  -- 10% de 4000 = 400
select quote_order(:'sid', jsonb_build_object('coupon_code', 'BEMVINDO', 'items',
  jsonb_build_array(jsonb_build_object('product_id', :'xburger', 'quantity', 1))));  -- ERRO cupom_pedido_minimo (2000 < 3000)
select quote_order(:'sid', jsonb_build_object('coupon_code', 'BEMVINDO', 'items',
  jsonb_build_array(jsonb_build_object('product_id', :'xburger', 'quantity', 20)))) ->> 'discount_cents' as teto;  -- 1500
select quote_order(:'sid', jsonb_build_object('coupon_code', 'NAOEXISTE', 'items',
  jsonb_build_array(jsonb_build_object('product_id', :'xburger')))); -- ERRO cupom_invalido
select quote_order(:'sid', jsonb_build_object('coupon_code', 'VELHO', 'items',
  jsonb_build_array(jsonb_build_object('product_id', :'xburger')))); -- ERRO cupom_expirado
select quote_order(:'sid', jsonb_build_object('coupon_code', 'FRETE', 'fulfillment', 'pickup', 'items',
  jsonb_build_array(jsonb_build_object('product_id', :'xburger')))); -- ERRO cupom_so_entrega
select price_order(:'sid', '{}'::jsonb, false);  -- ERRO sem permissão de executar

-- pedido com DEZ: 2 X-Burger 4000 + frete 700 - 1000 = 3700
select place_order(:'sid', (:'base'::jsonb) || jsonb_build_object('coupon_code', 'dez', 'delivery_zone_id', :'zona', 'items',
  jsonb_build_array(jsonb_build_object('product_id', :'xburger', 'quantity', 2)))) ->> 'total_cents' as total_dez;  -- 3700
-- DEZ só podia 1 vez
select place_order(:'sid', (:'base'::jsonb) || jsonb_build_object('coupon_code', 'DEZ', 'delivery_zone_id', :'zona', 'items',
  jsonb_build_array(jsonb_build_object('product_id', :'xburger', 'quantity', 2))));  -- ERRO cupom_esgotado
-- FRETE é só no primeiro pedido: Ana já pediu
select place_order(:'sid', (:'base'::jsonb) || jsonb_build_object('coupon_code', 'FRETE', 'delivery_zone_id', :'zona', 'items',
  jsonb_build_array(jsonb_build_object('product_id', :'xburger')))); -- ERRO cupom_primeiro_pedido
-- outro cliente usa FRETE: 2000 + 700 - 700 = 2000
select place_order(:'sid', (:'base'::jsonb) || jsonb_build_object('customer_phone', '11911112222', 'coupon_code', 'FRETE', 'delivery_zone_id', :'zona', 'items',
  jsonb_build_array(jsonb_build_object('product_id', :'xburger')))) ->> 'total_cents' as total_frete;  -- 2000

reset role;
select o.number, o.subtotal_cents, o.delivery_fee_cents, o.discount_cents, o.total_cents, o.coupon_code
  from orders o where store_id = :'sid' order by number;
select i.product_name, i.unit_price_cents, i.original_unit_price_cents, i.promotion_name
  from order_items i join orders o on o.id = i.order_id where o.store_id = :'sid' order by o.number;
-- cancelar o pedido do DEZ devolve o uso
update orders set status = 'cancelled' where store_id = :'sid' and coupon_code = 'DEZ';
set role anon;
select quote_order(:'sid', jsonb_build_object('coupon_code', 'DEZ', 'items',
  jsonb_build_array(jsonb_build_object('product_id', :'xburger', 'quantity', 2)))) ->> 'discount_cents' as dez_volta;  -- 1000
reset role;
