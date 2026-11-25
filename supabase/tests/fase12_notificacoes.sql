\set ON_ERROR_STOP 0
-- Fase 12: aparelhos que recebem notificações.
reset role;
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into stores (slug, name, open_override) values ('push12', 'Loja Push', true) returning id as sid \gset
reset role;
insert into couriers (store_id, name) values (:'sid', 'Zé') returning id as cid \gset

-- painel, motoboy e cliente
insert into push_subscriptions (store_id, audience, user_id, endpoint, p256dh, auth)
  values (:'sid', 'store', '11111111-1111-1111-1111-111111111111', 'https://push.exemplo/a', 'chave-p256dh-de-teste-123', 'auth-teste');
insert into push_subscriptions (store_id, audience, courier_id, endpoint, p256dh, auth)
  values (:'sid', 'courier', :'cid', 'https://push.exemplo/b', 'chave-p256dh-de-teste-123', 'auth-teste');
select count(*) as dois_aparelhos from push_subscriptions where store_id = :'sid';  -- 2

-- mesmo aparelho para o mesmo alvo: recusado (o servidor troca a linha antes)
insert into push_subscriptions (store_id, audience, user_id, endpoint, p256dh, auth)
  values (:'sid', 'store', '11111111-1111-1111-1111-111111111111', 'https://push.exemplo/a', 'outra-chave-p256dh-123', 'auth-2');  -- ERRO (duplicado)
-- alvo errado para o tipo: recusado
insert into push_subscriptions (store_id, audience, courier_id, endpoint, p256dh, auth)
  values (:'sid', 'store', :'cid', 'https://push.exemplo/c', 'chave-p256dh-de-teste-123', 'auth-teste');  -- ERRO (painel sem usuário)
-- endereço que não é https: recusado
insert into push_subscriptions (store_id, audience, user_id, endpoint, p256dh, auth)
  values (:'sid', 'store', '11111111-1111-1111-1111-111111111111', 'http://push.exemplo/d', 'chave-p256dh-de-teste-123', 'auth-teste');  -- ERRO (http)

-- o navegador não enxerga nem escreve na tabela
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select count(*) from push_subscriptions;  -- ERRO (sem permissão, nem para o dono da loja)
reset role; set role anon;
insert into push_subscriptions (store_id, audience, user_id, endpoint, p256dh, auth)
  values (:'sid', 'store', '11111111-1111-1111-1111-111111111111', 'https://push.exemplo/e', 'chave-p256dh-de-teste-123', 'auth-teste');  -- ERRO (sem permissão)

-- apagar o motoboy apaga o aparelho dele
reset role;
delete from couriers where id = :'cid';
select count(*) as sobrou_so_o_painel from push_subscriptions where store_id = :'sid';  -- 1
