\set ON_ERROR_STOP 0
-- Fase 15: Pix pelo WhatsApp. Usuário 1 = lojista, 2 = outra pessoa.
reset role; set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into stores (slug, name, open_override) values ('teste15', 'Loja Pix Zap', true) returning id as sid \gset
select save_category(:'sid', '{"name":"Pratos","has_sizes":false,"sizes":[],"groups":[]}') as cat \gset
select save_product(:'sid', jsonb_build_object('category_id',:'cat','name','Feijão tropeiro','price_cents',3500)) as prato \gset
select pix_whatsapp_enabled as comeca_desligado from stores where id = :'sid';  -- f

reset role; set role anon; set request.jwt.claim.sub = '';
select ('{"fulfillment":"pickup","customer_name":"Bia","customer_phone":"(31) 98234-6027","payment_method":"pix_whatsapp"}'::jsonb || jsonb_build_object('items', jsonb_build_array(jsonb_build_object('product_id', :'prato'))))::text as pedido \gset
select place_order(:'sid', :'pedido'::jsonb);  -- ERRO pagamento_indisponivel (opção desligada)

reset role; set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update stores set pix_whatsapp_enabled = true where id = :'sid';
reset role; set role anon; set request.jwt.claim.sub = '';
select place_order(:'sid', :'pedido'::jsonb);  -- ERRO pagamento_indisponivel (loja sem WhatsApp)

reset role; set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update stores set whatsapp = '31999998888' where id = :'sid';
reset role; set role anon; set request.jwt.claim.sub = '';
select place_order(:'sid', :'pedido'::jsonb) as r \gset
select (:'r'::jsonb)->>'number' as pedido_numero;  -- 1
reset role;
select id as oid from orders where store_id = :'sid' \gset
select payment_method, payment_status from orders where id = :'oid';  -- pix_whatsapp | on_delivery

-- outra pessoa não confirma o pagamento
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select set_whatsapp_pix_paid(:'oid', true);  -- ERRO sem permissão
-- nem dá para mudar o pagamento direto
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update orders set payment_status = 'paid' where id = :'oid';  -- ERRO permissão (coluna)

select set_whatsapp_pix_paid(:'oid', true)->>'payment_status' as marcado;  -- paid
reset role;
select payment_status, paid_at is not null as tem_paid_at from orders where id = :'oid';  -- paid | t
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select set_whatsapp_pix_paid(:'oid', false)->>'payment_status' as desfeito;  -- on_delivery
reset role;
select paid_at is null as sem_paid_at from orders where id = :'oid';  -- t

-- só vale para pedidos com Pix pelo WhatsApp
set role anon; set request.jwt.claim.sub = '';
select place_order(:'sid', '{"fulfillment":"pickup","customer_name":"Rui","customer_phone":"(31) 98234-6028","payment_method":"cash"}'::jsonb || jsonb_build_object('items', jsonb_build_array(jsonb_build_object('product_id', :'prato')))) as r2 \gset
reset role;
select id as oid2 from orders where store_id = :'sid' and payment_method = 'cash' \gset
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select set_whatsapp_pix_paid(:'oid2', true);  -- ERRO pagamento_invalido

-- aparece no financeiro como forma de pagamento própria
select finance_report(:'sid', (now() at time zone 'America/Sao_Paulo')::date, (now() at time zone 'America/Sao_Paulo')::date)->'by_method' ? 'pix_whatsapp' as no_financeiro;  -- t
reset role;
