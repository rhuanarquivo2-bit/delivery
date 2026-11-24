\set ON_ERROR_STOP 0
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into stores (slug, name) values ('pizzaria-joao', 'Pizzaria do João') returning id \gset
select role from store_members where store_id = :'id';
select replace_store_hours(:'id', '[{"weekday":5,"opens_at":"18:00","closes_at":"02:00"}]');
select replace_store_hours(:'id', '[{"weekday":5,"opens_at":"18:00","closes_at":"02:00"},{"weekday":6,"opens_at":"18:00","closes_at":"23:30"}]');
select count(*) as horas from store_hours;
select replace_delivery_zones(:'id', '[{"neighborhood":"Centro","fee_cents":500,"active":true,"sort_order":0}]');
insert into storage.objects (bucket_id, name) values ('store-assets', :'id' || '/logo.png');
-- outro usuário
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
update stores set name = 'Hackeada' where id = :'id';
select name from stores where id = :'id';
select replace_delivery_zones(:'id', '[]');
insert into store_hours (store_id, weekday, opens_at, closes_at) values (:'id', 1, '10:00', '12:00');
insert into storage.objects (bucket_id, name) values ('store-assets', :'id' || '/x.png');
insert into stores (slug, name, created_by) values ('falsa', 'Falsa', '11111111-1111-1111-1111-111111111111');
insert into stores (slug, name) values ('Ruim Slug', 'X');
-- anônimo lê
reset role; set role anon; set request.jwt.claim.sub = '';
select slug, (select count(*) from delivery_zones) zonas from stores;
