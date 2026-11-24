\set ON_ERROR_STOP 0
-- Fase 4: Pix online e financeiro.
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into stores (slug, name, open_override) values ('pix4', 'Pix Quatro', true) returning id as sid \gset
insert into stores (slug, name, pix_provider) values ('hack4', 'Hack', 'asaas');  -- ERRO só o servidor
update stores set pix_provider = 'mercadopago' where id = :'sid';  -- ERRO só o servidor
select import_menu(:'sid', '{"categories":[{"name":"Lanches","products":[{"name":"X-Tudo","price_cents":3000},{"name":"Suco","price_cents":1000}]}]}');
select id as xtudo from products where store_id = :'sid' and name = 'X-Tudo' \gset
select id as suco from products where store_id = :'sid' and name = 'Suco' \gset
select count(*) as dono_ve_contas from store_payment_accounts;  -- ERRO permissão

\set pedido '{"fulfillment":"pickup","customer_name":"Rui","customer_phone":"11912345678"}'
reset role; set role anon; set request.jwt.claim.sub = '';
-- loja sem conta: Pix online indisponível
select place_order(:'sid', (:'pedido'::jsonb) || jsonb_build_object('payment_method', 'pix_online', 'items', jsonb_build_array(jsonb_build_object('product_id', :'xtudo'))));  -- ERRO pagamento_indisponivel

-- servidor conecta o Asaas
reset role; set role service_role;
insert into store_payment_accounts (store_id, provider, access_token, webhook_token) values (:'sid', 'asaas', 'tok', 'wh');
update stores set pix_provider = 'asaas' where id = :'sid';
reset role; set role anon;
select place_order(:'sid', (:'pedido'::jsonb) || jsonb_build_object('payment_method', 'pix_online', 'items', jsonb_build_array(jsonb_build_object('product_id', :'xtudo'))));  -- ERRO documento_obrigatorio
select place_order(:'sid', (:'pedido'::jsonb) || jsonb_build_object('payment_method', 'pix_online', 'customer_document', '123', 'items', jsonb_build_array(jsonb_build_object('product_id', :'xtudo'))));  -- ERRO documento_invalido
select place_order(:'sid', (:'pedido'::jsonb) || jsonb_build_object('payment_method', 'pix_online', 'customer_document', '529.982.247-25', 'items', jsonb_build_array(jsonb_build_object('product_id', :'xtudo', 'quantity', 2)))) as pix1 \gset
\echo :pix1
select place_order(:'sid', (:'pedido'::jsonb) || jsonb_build_object('payment_method', 'pix_online', 'customer_document', '52998224725', 'items', jsonb_build_array(jsonb_build_object('product_id', :'suco')))) as pix2 \gset
select place_order(:'sid', (:'pedido'::jsonb) || jsonb_build_object('payment_method', 'cash', 'items', jsonb_build_array(jsonb_build_object('product_id', :'xtudo')))) ->> 'payment_status' as dinheiro;  -- on_delivery
select place_order(:'sid', (:'pedido'::jsonb) || jsonb_build_object('payment_method', 'card_delivery', 'items', jsonb_build_array(jsonb_build_object('product_id', :'suco'), jsonb_build_object('product_id', :'xtudo')))) ->> 'payment_status' as cartao;
select place_order(:'sid', (:'pedido'::jsonb) || jsonb_build_object('payment_method', 'pix_delivery', 'items', jsonb_build_array(jsonb_build_object('product_id', :'suco')))) as cancelar \gset

-- servidor registra as cobranças; a de pix2 já venceu
reset role; set role service_role;
insert into order_payments (order_id, store_id, provider, external_id, amount_cents, qr_code, expires_at)
  values ((:'pix1'::jsonb->>'id')::uuid, :'sid', 'asaas', 'pay_1', 6000, '000201...', now() + interval '30 minutes');
insert into order_payments (order_id, store_id, provider, external_id, amount_cents, qr_code, expires_at)
  values ((:'pix2'::jsonb->>'id')::uuid, :'sid', 'asaas', 'pay_2', 1000, '000201...', now() - interval '1 minute');

reset role; set role anon;
select (get_public_order((:'pix1'::jsonb->>'token')::uuid)) - 'store' - 'items' - 'created_at' as acompanhamento;
select mark_order_paid((:'pix1'::jsonb->>'id')::uuid, 'pay_1', 6000);  -- ERRO cliente não confirma pagamento
select expire_order_payment((:'pix2'::jsonb->>'id')::uuid);  -- ERRO

reset role; set role service_role;
select mark_order_paid((:'pix1'::jsonb->>'id')::uuid, 'pay_x', 6000) as id_errado;  -- f
select mark_order_paid((:'pix1'::jsonb->>'id')::uuid, 'pay_1', 5999) as valor_menor;  -- f
select mark_order_paid((:'pix1'::jsonb->>'id')::uuid, 'pay_1', 6000) as pago;  -- t
select expire_order_payment((:'pix1'::jsonb->>'id')::uuid) as nao_expira_pago;  -- f
select expire_order_payment((:'pix2'::jsonb->>'id')::uuid) as expirou;  -- t
reset role;
update orders set status = 'cancelled' where id = (:'cancelar'::jsonb->>'id')::uuid;
select number, payment_method, payment_status, status, paid_at is not null as pago, customer_document from orders where store_id = :'sid' order by number;
select (get_public_order((:'pix1'::jsonb->>'token')::uuid)) -> 'pix' as qr_some_depois_de_pago;

-- financeiro: X-Tudo pix 6000 + dinheiro 3000 + cartão 4000 = 13000 em 3 pedidos; 1 cancelado (1000); Pix vencido fica fora
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select finance_report(:'sid', (now() at time zone 'America/Sao_Paulo')::date - 1, (now() at time zone 'America/Sao_Paulo')::date) - 'by_day' as financeiro;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select finance_report(:'sid', current_date, current_date);  -- ERRO sem permissão
reset role;
