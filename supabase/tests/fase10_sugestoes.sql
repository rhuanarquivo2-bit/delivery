\set ON_ERROR_STOP 0
-- Fase 10: sugestões no carrinho.
reset role;
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into stores (slug, name, open_override) values ('sugere10', 'Loja Sugere', true) returning id as sid \gset
select save_category(:'sid', '{"name":"Lanches","has_sizes":false,"sizes":[],"groups":[]}') as lanches \gset
select save_category(:'sid', '{"name":"Porções","has_sizes":false,"sizes":[],"groups":[]}') as porcoes \gset
select save_category(:'sid', '{"name":"Bebidas","has_sizes":false,"sizes":[],"groups":[]}') as bebidas \gset
select save_product(:'sid', jsonb_build_object('category_id',:'lanches','name','X-Burger','price_cents',3000)) as burger \gset
select save_product(:'sid', jsonb_build_object('category_id',:'lanches','name','X-Bacon','price_cents',3400)) as bacon \gset
select save_product(:'sid', jsonb_build_object('category_id',:'porcoes','name','Batata','price_cents',2000)) as batata \gset
select save_product(:'sid', jsonb_build_object('category_id',:'bebidas','name','Coca lata','price_cents',600)) as coca \gset
select save_product(:'sid', jsonb_build_object('category_id',:'bebidas','name','Suco','price_cents',900)) as suco \gset

reset role; set role anon; set request.jwt.claim.sub = '';
-- loja sem histórico: reserva com categorias que faltam (porções e bebidas), nada de lanche
select array_agg(p.name || ':' || s.reason order by s.ord) as sem_historico
from cart_suggestions(:'sid', array[:'burger']::uuid[]) with ordinality s(id, reason, src, ord) join products p on p.id = s.id;
-- {Batata:popular,Coca lata:popular,Suco:popular}
select count(*) as carrinho_vazio from cart_suggestions(:'sid', '{}'::uuid[]);  -- 0

-- histórico: burger + suco em 2 pedidos, burger + batata em 1, bacon + coca em 3
\set base '{"fulfillment":"pickup","customer_name":"Ana","customer_phone":"11988887777","payment_method":"cash"}'
select place_order(:'sid', (:'base'::jsonb) || jsonb_build_object('items', jsonb_build_array(jsonb_build_object('product_id', :'burger'), jsonb_build_object('product_id', :'suco'))));
select place_order(:'sid', (:'base'::jsonb) || jsonb_build_object('items', jsonb_build_array(jsonb_build_object('product_id', :'burger'), jsonb_build_object('product_id', :'suco'))));
select place_order(:'sid', (:'base'::jsonb) || jsonb_build_object('items', jsonb_build_array(jsonb_build_object('product_id', :'burger'), jsonb_build_object('product_id', :'batata'))));
select place_order(:'sid', (:'base'::jsonb) || jsonb_build_object('items', jsonb_build_array(jsonb_build_object('product_id', :'bacon'), jsonb_build_object('product_id', :'coca', 'quantity', 2))));
select place_order(:'sid', (:'base'::jsonb) || jsonb_build_object('items', jsonb_build_array(jsonb_build_object('product_id', :'bacon'), jsonb_build_object('product_id', :'coca'))));
select place_order(:'sid', (:'base'::jsonb) || jsonb_build_object('items', jsonb_build_array(jsonb_build_object('product_id', :'bacon'), jsonb_build_object('product_id', :'coca'))));

-- burger no carrinho: suco vem primeiro como "comprado junto" (2 pedidos); batata (só 1) cai na reserva
select array_agg(p.name || ':' || s.reason order by s.ord) as com_burger,
       bool_and(s.src is null or s.src = :'burger') as origem_burger
from cart_suggestions(:'sid', array[:'burger']::uuid[]) with ordinality s(id, reason, src, ord) join products p on p.id = s.id;
-- {Suco:together,Coca lata:popular,Batata:popular} | t   (coca vendeu mais que batata)

-- item que já está no carrinho não é sugerido
select bool_and(s.product_id <> :'suco') as nao_repete_carrinho from cart_suggestions(:'sid', array[:'burger', :'suco']::uuid[]) s;  -- t

-- limite
select count(*) as limite_1 from cart_suggestions(:'sid', array[:'burger']::uuid[], 1);  -- 1

-- lojista fixa a batata e pausa o suco
reset role; set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update stores set upsell_product_ids = array[:'batata']::uuid[] where id = :'sid';
update products set active = false where id = :'suco';
update stores set upsell_product_ids = array[:'batata', :'coca', :'suco', :'bacon']::uuid[] where id = :'sid';  -- ERRO (máximo 3)
reset role; set role anon;
select array_agg(p.name || ':' || s.reason order by s.ord) as fixado_e_pausado
from cart_suggestions(:'sid', array[:'burger']::uuid[]) with ordinality s(id, reason, src, ord) join products p on p.id = s.id;
-- {Batata:pinned,Coca lata:popular} (suco pausado some)

-- lojista desliga as sugestões
reset role; set role authenticated;
update stores set upsell_enabled = false where id = :'sid';
reset role; set role anon;
select count(*) as desligado from cart_suggestions(:'sid', array[:'burger']::uuid[]);  -- 0

-- outro usuário não mexe nas sugestões da loja
reset role; set role authenticated; set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
update stores set upsell_enabled = true where id = :'sid';  -- UPDATE 0
reset role;
select upsell_enabled as continua_desligado from stores where id = :'sid';  -- f
