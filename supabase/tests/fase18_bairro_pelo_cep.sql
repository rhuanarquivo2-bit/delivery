\set ON_ERROR_STOP 0
-- Fase 18: bairro e taxa automáticos pelo CEP. Usuário 1 = lojista.
reset role; set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into stores (slug, name, open_override) values ('teste18', 'Loja Bairros', true) returning id as sid \gset
select save_category(:'sid', '{"name":"Pratos","has_sizes":false,"sizes":[],"groups":[]}') as cat \gset
select save_product(:'sid', jsonb_build_object('category_id',:'cat','name','Marmita','price_cents',2000)) as prato \gset

-- bairros com outros nomes + taxa para quem não está na lista
select replace_delivery_zones(:'sid', '[
  {"neighborhood":"Centro","fee_cents":500,"active":true,"sort_order":0,"aliases":["Praia"," Vila Praia ",""]},
  {"neighborhood":"Areão","fee_cents":700,"active":true,"sort_order":1},
  {"neighborhood":"Outros bairros","fee_cents":1200,"active":true,"sort_order":2,"catch_all":true}]');
select neighborhood, fee_cents, aliases, catch_all from delivery_zones where store_id = :'sid' order by sort_order;
-- Centro | 500 | {Praia,"Vila Praia"} | f
-- Areão | 700 | {} | f
-- Outros bairros | 1200 | {} | t

-- só uma linha "outros bairros" por loja
select replace_delivery_zones(:'sid', '[
  {"neighborhood":"Aa","fee_cents":1,"active":true,"sort_order":0,"catch_all":true},
  {"neighborhood":"Bb","fee_cents":1,"active":true,"sort_order":1,"catch_all":true}]');  -- ERRO duplicate key
select count(*) as continua_3 from delivery_zones where store_id = :'sid';  -- 3

-- salvar do jeito antigo (sem as colunas novas) continua funcionando
select replace_delivery_zones(:'sid', '[{"neighborhood":"Centro","fee_cents":500,"active":true,"sort_order":0}]');
select aliases, catch_all from delivery_zones where store_id = :'sid';  -- {} | f
select replace_delivery_zones(:'sid', '[
  {"neighborhood":"Centro","fee_cents":500,"active":true,"sort_order":0,"aliases":["Praia"]},
  {"neighborhood":"Outros bairros","fee_cents":1200,"active":true,"sort_order":1,"catch_all":true}]');
select id as centro from delivery_zones where store_id = :'sid' and not catch_all \gset
select id as outros from delivery_zones where store_id = :'sid' and catch_all \gset

reset role; set role anon; set request.jwt.claim.sub = '';
select aliases, catch_all from delivery_zones where id = :'outros';  -- cliente enxerga: {} | t

-- bairro da lista: guarda o nome do bairro da loja e a taxa dele
select place_order(:'sid', jsonb_build_object('fulfillment','delivery','customer_name','Ana','customer_phone','31982346001',
  'payment_method','cash','address_street','Rua Januária','address_number','15','address_district','Praia',
  'delivery_zone_id', :'centro', 'items', jsonb_build_array(jsonb_build_object('product_id', :'prato')))) as r1 \gset
-- fora da lista: taxa "outros bairros" e o bairro de verdade do cliente
select place_order(:'sid', jsonb_build_object('fulfillment','delivery','customer_name','Bia','customer_phone','31982346002',
  'payment_method','cash','address_street','Rua das Flores','address_number','20','address_district','  Morro   Alto ',
  'delivery_zone_id', :'outros', 'items', jsonb_build_array(jsonb_build_object('product_id', :'prato')))) as r2 \gset
-- retirada não ganha bairro
select place_order(:'sid', jsonb_build_object('fulfillment','pickup','customer_name','Caio','customer_phone','31982346003',
  'payment_method','cash','address_district','Morro Alto',
  'items', jsonb_build_array(jsonb_build_object('product_id', :'prato')))) as r3 \gset
-- sem bairro de entrega continua recusando
select place_order(:'sid', jsonb_build_object('fulfillment','delivery','customer_name','Duda','customer_phone','31982346004',
  'payment_method','cash','address_street','Rua X','address_number','1','address_district','Morro Alto',
  'items', jsonb_build_array(jsonb_build_object('product_id', :'prato'))));  -- ERRO bairro_invalido
-- a versão interna não fica aberta para o público
select place_order_loyalty(:'sid', '{}'::jsonb);  -- ERRO permissão

reset role;
select customer_name, address_district, delivery_fee_cents, total_cents from orders where store_id = :'sid' order by number;
-- Ana | Centro | 500 | 2500
-- Bia | Morro Alto | 1200 | 3200
-- Caio | (vazio) | 0 | 2000
