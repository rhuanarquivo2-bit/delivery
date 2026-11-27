\set ON_ERROR_STOP 0
-- Fase 17: tela da cozinha (KDS). Usuário 1 = lojista, 2 = outra pessoa.
reset role; set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into stores (slug, name, open_override) values ('cozinha17', 'Loja Cozinha', true) returning id as sid \gset
select kitchen_target_minutes as alvo_padrao from stores where id = :'sid';  -- 20
update stores set kitchen_target_minutes = 3 where id = :'sid';  -- ERROR: check (mínimo 5)
update stores set kitchen_target_minutes = 25 where id = :'sid' returning kitchen_target_minutes as alvo;  -- 25
select save_category(:'sid', '{"name":"Lanches","has_sizes":false,"sizes":[],"groups":[]}') as cat \gset
select save_product(:'sid', jsonb_build_object('category_id',:'cat','name','X-Burger','price_cents',3000)) as burger \gset
select save_product(:'sid', jsonb_build_object('category_id',:'cat','name','Batata','price_cents',1500)) as batata \gset

reset role; set role anon; set request.jwt.claim.sub = '';
select place_order(:'sid', jsonb_build_object('fulfillment','pickup','customer_name','Bia Lima','customer_phone','11977776666',
  'payment_method','cash','notes','Capricha',
  'items', jsonb_build_array(jsonb_build_object('product_id', :'burger', 'quantity', 2, 'notes', 'sem cebola'),
                             jsonb_build_object('product_id', :'batata')))) ->> 'token' as tok \gset
reset role;
select id as oid from orders where public_token = :'tok' \gset
select id as item1 from order_items where order_id = :'oid' order by sort_order limit 1 \gset

-- sem login e sem link, nada
set role anon;
select kitchen_board(:'sid');  -- ERROR: sem_permissao
select kitchen_board(null, gen_random_uuid());  -- ERROR: link_invalido
select kitchen_link_rotate(:'sid');  -- ERROR: permission denied
select * from kitchen_links;  -- ERROR: permission denied

-- outra pessoa logada não vê a cozinha da loja
reset role; set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select kitchen_board(:'sid');  -- ERROR: sem_permissao
select kitchen_link_rotate(:'sid');  -- ERROR: sem_permissao
select kitchen_update(:'oid', 'preparing');  -- ERROR: sem_permissao
select kitchen_item_done(:'item1', true);  -- ERROR: sem_permissao

-- a equipe vê o pedido: itens, observações, sem preço nem telefone
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select kitchen_board(:'sid') -> 'store' ->> 'kitchen_target_minutes' as alvo_na_tela;  -- 25
select o->>'number' as numero, o->>'status' as status, o->>'notes' as obs, jsonb_array_length(o->'items') as itens,
       o->'items'->0->>'quantity' as qtd, o->'items'->0->>'notes' as obs_item,
       o ? 'total_cents' as tem_preco, o ? 'customer_phone' as tem_telefone
from jsonb_array_elements(kitchen_board(:'sid') -> 'orders') o;  -- 1 | pending | Capricha | 2 | 2 | sem cebola | f | f

-- aceitar, riscar item, pronto, voltar
select kitchen_update(:'oid', 'preparing') ->> 'status' as aceito;  -- preparing
select kitchen_update(:'oid', 'preparing') ->> 'status' as toque_duplo;  -- preparing (sem erro)
select kitchen_item_done(:'item1', true) is not null as item_riscado;  -- t
select kitchen_board(:'sid') -> 'orders' -> 0 -> 'items' -> 0 ->> 'done_at' is not null as riscado_na_tela;  -- t
select kitchen_item_done(:'item1', false) is null as item_desfeito;  -- t
select kitchen_update(:'oid', 'delivered');  -- ERROR: status_invalido (a cozinha não entrega)
select kitchen_update(:'oid', 'cancelled');  -- ERROR: status_invalido (a cozinha não cancela)
select kitchen_update(:'oid', 'ready') ->> 'status' as pronto;  -- ready
reset role;
select ready_at is not null as tem_hora_pronto, accepted_at is not null as tem_hora_aceite from orders where id = :'oid';  -- t | t
set role authenticated;
select kitchen_item_done(:'item1', true);  -- ERROR: status_invalido (pedido já está pronto)
select kitchen_update(:'oid', 'preparing') ->> 'status' as voltou;  -- preparing
reset role;
select ready_at is null as hora_pronto_apagada from orders where id = :'oid';  -- t
set role authenticated;

-- link da cozinha: abre sem login, troca e desliga
select kitchen_link_rotate(:'sid') as link1 \gset
select count(*) as links_visiveis from kitchen_links;  -- 1
reset role; set role anon; set request.jwt.claim.sub = '';
select kitchen_board(null, :'link1') -> 'store' ->> 'name' as loja_pelo_link;  -- Loja Cozinha
select kitchen_update(:'oid', 'ready', :'link1') ->> 'status' as pronto_pelo_link;  -- ready
select kitchen_update(:'oid', 'preparing', :'link1') ->> 'status' as voltou_pelo_link;  -- preparing
select kitchen_item_done(:'item1', true, :'link1') is not null as riscado_pelo_link;  -- t
-- o link só serve para a loja dele
reset role; set role authenticated; set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
insert into stores (slug, name, open_override) values ('outra17', 'Outra Loja', true) returning id as sid2 \gset
select kitchen_link_rotate(:'sid2') as link2 \gset
reset role; set role anon; set request.jwt.claim.sub = '';
select kitchen_update(:'oid', 'ready', :'link2');  -- ERROR: pedido_nao_encontrado
select kitchen_item_done(:'item1', false, :'link2');  -- ERROR: item_nao_encontrado
-- trocar o link derruba o antigo
reset role; set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select kitchen_link_rotate(:'sid') as link3 \gset
select :'link1' <> :'link3' as link_trocado;  -- t
reset role; set role anon; set request.jwt.claim.sub = '';
select kitchen_board(null, :'link1');  -- ERROR: link_invalido
select jsonb_array_length(kitchen_board(null, :'link3') -> 'orders') as pedidos_link_novo;  -- 1
reset role; set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select kitchen_link_disable(:'sid');
reset role; set role anon; set request.jwt.claim.sub = '';
select kitchen_board(null, :'link3');  -- ERROR: link_invalido

-- cancelado aparece por 15 minutos (para a cozinha parar); Pix online não pago não aparece
reset role;
update orders set status = 'cancelled', cancel_reason = 'cliente desistiu' where id = :'oid';
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select o->>'status' as status, o->>'cancel_reason' as motivo from jsonb_array_elements(kitchen_board(:'sid') -> 'orders') o;  -- cancelled | cliente desistiu
select kitchen_update(:'oid', 'preparing');  -- ERROR: status_invalido
reset role;
update orders set cancelled_at = now() - interval '20 minutes' where id = :'oid';
insert into orders (store_id, number, fulfillment, customer_name, customer_phone, subtotal_cents, total_cents, payment_method, payment_status)
values (:'sid', 99, 'pickup', 'Pix', '11900000000', 100, 100, 'pix_online', 'awaiting');
set role authenticated;
select jsonb_array_length(kitchen_board(:'sid') -> 'orders') as pedidos_na_tela;  -- 0

-- loja bloqueada não abre a cozinha (usuário 2 é administrador da plataforma desde a fase 13)
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select admin_set_store_blocked(:'sid', true, 'teste') is not null as bloqueada;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select kitchen_board(:'sid');  -- ERROR: loja_indisponivel
reset role;
