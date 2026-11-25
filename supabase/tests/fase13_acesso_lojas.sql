\set ON_ERROR_STOP 0
-- Fase 13: controle de acesso das lojas pelo administrador da plataforma.
-- Usuário 1 = lojista. Usuário 2 = administrador da plataforma.
reset role;
update auth.users set email = 'lojista@exemplo.com' where id = '11111111-1111-1111-1111-111111111111';
insert into platform_admins (user_id) values ('22222222-2222-2222-2222-222222222222');

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
-- loja nova: ganha 7 dias de teste, mesmo tentando se dar validade maior ou começar bloqueada
insert into stores (slug, name, open_override, access_until, blocked)
  values ('acesso13', 'Loja Acesso', true, now() + interval '10 years', true) returning id as sid \gset
select blocked = false as nao_bloqueada,
       access_until between now() + interval '6 days 23 hours' and now() + interval '7 days 1 hour' as teste_7_dias
  from stores where id = :'sid';  -- t, t
select save_category(:'sid', '{"name":"Lanches","has_sizes":false,"sizes":[],"groups":[]}') as cat \gset
select save_product(:'sid', jsonb_build_object('category_id',:'cat','name','X-Burger','price_cents',3000)) as burger \gset

-- o lojista não muda a própria validade nem se desbloqueia
update stores set access_until = now() + interval '1 year' where id = :'sid';  -- ERRO acesso_somente_admin
update stores set blocked = true where id = :'sid';  -- ERRO acesso_somente_admin
-- mas continua editando o resto da loja
update stores set name = 'Loja Acesso 2' where id = :'sid';
-- e não usa as funções do administrador
select count(*) from admin_list_stores();  -- ERRO sem permissão
select admin_extend_store(:'sid', 30);  -- ERRO sem permissão
select admin_set_store_blocked(:'sid', false);  -- ERRO sem permissão
select admin_save_settings(30, null);  -- ERRO sem permissão
select count(*) from store_admin_notes;  -- ERRO sem permissão
select count(*) from platform_admins;  -- ERRO sem permissão
select trial_days as le_configuracao from platform_settings;  -- 7
update platform_settings set trial_days = 365;  -- ERRO sem permissão
select is_platform_admin() as lojista_nao_e_admin;  -- f

-- pedido dentro do teste: aceito
reset role; set role anon; set request.jwt.claim.sub = '';
\set ped '{"fulfillment":"pickup","customer_name":"Bia","customer_phone":"(31) 98234-6027","payment_method":"cash"}'
select place_order(:'sid', (:'ped'::jsonb) || jsonb_build_object('items', jsonb_build_array(jsonb_build_object('product_id', :'burger'))))->>'number' as pedido_no_teste;  -- 1

-- administrador
reset role; set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select is_platform_admin() as e_admin;  -- t
select name, owner_email, orders_total, orders_30d from admin_list_stores() where id = :'sid';  -- Loja Acesso 2 | lojista@exemplo.com | 1 | 1
select admin_save_note(:'sid', 'Pagou via Pix em novembro');
select note from admin_list_stores() where id = :'sid';  -- Pagou via Pix em novembro

-- validade vencida: pedido recusado
select admin_set_store_until(:'sid', now() - interval '1 day');
reset role; set role anon; set request.jwt.claim.sub = '';
select place_order(:'sid', (:'ped'::jsonb) || jsonb_build_object('items', jsonb_build_array(jsonb_build_object('product_id', :'burger'))));  -- ERRO loja_indisponivel

-- +30 dias conta a partir de hoje (já tinha vencido)
reset role; set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select admin_extend_store(:'sid', 30) as v1 \gset
select :'v1'::timestamptz between now() + interval '29 days 23 hours' and now() + interval '30 days 1 hour' as mais_30_dias;  -- t
-- +30 de novo soma em cima da validade atual
select admin_extend_store(:'sid', 30) as v2 \gset
select :'v2'::timestamptz between now() + interval '59 days 23 hours' and now() + interval '60 days 1 hour' as soma_60;  -- t
select admin_extend_store(:'sid', 0);  -- ERRO dias_invalidos

-- bloqueio: pedido recusado mesmo com validade em dia
select admin_set_store_blocked(:'sid', true, '  Mensalidade em aberto  ');
select blocked, blocked_reason from stores where id = :'sid';  -- t | Mensalidade em aberto
reset role; set role anon; set request.jwt.claim.sub = '';
select place_order(:'sid', (:'ped'::jsonb) || jsonb_build_object('items', jsonb_build_array(jsonb_build_object('product_id', :'burger'))));  -- ERRO loja_indisponivel

-- desbloqueio sem prazo: volta a receber
reset role; set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select admin_set_store_blocked(:'sid', false, 'ignorado');
select admin_set_store_until(:'sid', null);
select blocked, blocked_reason is null as sem_motivo, access_until is null as sem_prazo from stores where id = :'sid';  -- f | t | t
reset role; set role anon; set request.jwt.claim.sub = '';
select place_order(:'sid', (:'ped'::jsonb) || jsonb_build_object('items', jsonb_build_array(jsonb_build_object('product_id', :'burger'))))->>'number' as pedido_liberado;  -- 2

-- configuração: dias de teste valem para as próximas lojas
reset role; set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select admin_save_settings(15, '(31) 99999-0000');
select trial_days, support_whatsapp from platform_settings;  -- 15 | 31999990000
select admin_save_settings(500, null);  -- ERRO (máximo 365)
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into stores (slug, name) values ('nova13', 'Nova') returning access_until > now() + interval '14 days' as teste_15_dias;  -- t

-- loja de demonstração: fica fora da lista e nunca vence
reset role;
insert into stores (slug, name, is_demo, created_by) values ('demo13', 'Demo', true, '11111111-1111-1111-1111-111111111111');
select access_until is null as demo_sem_prazo from stores where slug = 'demo13';  -- t
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select count(*) as demo_fora_da_lista from admin_list_stores() where slug = 'demo13';  -- 0
select admin_set_store_blocked((select id from stores where slug = 'demo13'), true);  -- ERRO loja_nao_encontrada

-- visitante anônimo não chega nas funções
reset role; set role anon; set request.jwt.claim.sub = '';
select count(*) from admin_list_stores();  -- ERRO
