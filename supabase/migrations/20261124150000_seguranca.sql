-- Fase 16: reforço de segurança.
-- Pode rodar mais de uma vez sem problema (tudo é "se não existir" / "substitui").
--
-- 1. Endereço do cliente no checkout: antes, quem soubesse o celular de alguém via o nome
--    e o endereço dessa pessoa. Agora o aparelho precisa provar que já fez um pedido com
--    aquele celular (o link do pedido que fica guardado no próprio celular do cliente).
-- 2. Saldo de pontos e funções internas deixam de ser chamadas direto pela internet.
-- 3. Visitante da demonstração (login anônimo) não cria loja de verdade.
-- 4. Arquivos das lojas: só imagens, até 6 MB.
-- 5. Limite de pedidos para evitar enxurrada de pedidos falsos.
-- 6. Leitura de cardápio por foto (IA): limite por dia em cada loja.

-- ---------------------------------------------------------------------------
-- 1. Cliente pelo celular só com o link de um pedido daquele celular
-- ---------------------------------------------------------------------------
drop function if exists public.customer_lookup(uuid, text);

create or replace function public.customer_lookup(p_store_id uuid, p_phone text, p_tokens uuid[])
returns table (
  name text,
  street text,
  number text,
  complement text,
  reference text,
  delivery_zone_id uuid,
  zip text,
  orders bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with phone as (
    select regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') as digits
  ),
  proven as (
    -- o aparelho tem o link de pelo menos um pedido desse celular nesta loja
    select 1
    from public.orders o, phone
    where o.store_id = p_store_id
      and o.customer_phone = phone.digits
      and o.public_token = any (coalesce(p_tokens[1:50], '{}'))
    limit 1
  ),
  mine as (
    select o.*
    from public.orders o, phone
    where o.store_id = p_store_id
      and length(phone.digits) between 10 and 11
      and o.customer_phone = phone.digits
      and exists (select 1 from proven)
  )
  select
    last.customer_name,
    addr.address_street,
    addr.address_number,
    addr.address_complement,
    addr.address_reference,
    addr.delivery_zone_id,
    addr.address_zip,
    (select count(*) from mine where status <> 'cancelled')
  from (select * from mine order by created_at desc limit 1) last
  left join lateral (
    select * from mine where fulfillment = 'delivery' order by created_at desc limit 1
  ) addr on true;
$$;

revoke all on function public.customer_lookup(uuid, text, uuid[]) from public;
grant execute on function public.customer_lookup(uuid, text, uuid[]) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Funções internas: só o próprio banco chama
-- ---------------------------------------------------------------------------
-- (o "revoke from public" antigo não tirava a permissão que o Supabase dá ao anon)
revoke all on function public.loyalty_balance(uuid, text) from public, anon, authenticated;
revoke all on function public.loyalty_owner_phone(uuid, text, uuid[]) from public, anon, authenticated;
revoke all on function public.order_summary(public.orders) from public, anon, authenticated;
revoke all on function public.admin_require() from public, anon;
revoke all on function public.admin_list_stores() from public, anon;
revoke all on function public.admin_extend_store(uuid, integer) from public, anon;
revoke all on function public.admin_set_store_until(uuid, timestamptz) from public, anon;
revoke all on function public.admin_set_store_blocked(uuid, boolean, text) from public, anon;
revoke all on function public.admin_save_note(uuid, text) from public, anon;
revoke all on function public.admin_save_settings(integer, text) from public, anon;
revoke all on function public.admin_set_store_paid(uuid, boolean) from public, anon;
revoke all on function public.admin_delete_store(uuid, text) from public, anon;
grant execute on function public.admin_require() to authenticated;
grant execute on function public.admin_list_stores() to authenticated;
grant execute on function public.admin_extend_store(uuid, integer) to authenticated;
grant execute on function public.admin_set_store_until(uuid, timestamptz) to authenticated;
grant execute on function public.admin_set_store_blocked(uuid, boolean, text) to authenticated;
grant execute on function public.admin_save_note(uuid, text) to authenticated;
grant execute on function public.admin_save_settings(integer, text) to authenticated;
grant execute on function public.admin_set_store_paid(uuid, boolean) to authenticated;
grant execute on function public.admin_delete_store(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Loja de verdade só com conta de e-mail (a demonstração cria a dela pelo servidor)
-- ---------------------------------------------------------------------------
drop policy if exists "usuário logado cria loja" on public.stores;
create policy "usuário logado cria loja" on public.stores
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );

-- ---------------------------------------------------------------------------
-- 4. Arquivos: só imagens, até 6 MB (o painel já limita a 5 MB)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types') then
    update storage.buckets
    set file_size_limit = 6 * 1024 * 1024,
        allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
    where id = 'store-assets';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Limite de pedidos (contra robôs enchendo o painel de pedidos falsos)
--    * no máximo 8 pedidos do mesmo celular em 10 minutos na mesma loja
--    * no máximo 40 pedidos por minuto na mesma loja
--    Lojas de demonstração e a própria equipe da loja (logada, testando) não têm limite.
-- ---------------------------------------------------------------------------
create or replace function public.guard_order_rate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_store_member(new.store_id)
     or exists (select 1 from public.stores s where s.id = new.store_id and s.is_demo) then
    return new;
  end if;
  if (select count(*) from public.orders o
      where o.store_id = new.store_id
        and o.customer_phone = new.customer_phone
        and o.created_at > now() - interval '10 minutes') >= 8
     or (select count(*) from public.orders o
         where o.store_id = new.store_id
           and o.created_at > now() - interval '1 minute') >= 40 then
    raise exception 'muitos_pedidos' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_guard_rate on public.orders;
create trigger orders_guard_rate
  before insert on public.orders
  for each row execute function public.guard_order_rate();

-- ---------------------------------------------------------------------------
-- 6. Leitura de cardápio por foto: 3 na demonstração, 20 por dia nas lojas
-- ---------------------------------------------------------------------------
create table if not exists public.store_ai_reads (
  store_id uuid not null references public.stores (id) on delete cascade,
  day date not null,
  reads integer not null default 0,
  primary key (store_id, day)
);
alter table public.store_ai_reads enable row level security;
revoke all on public.store_ai_reads from anon, authenticated;

create or replace function public.consume_demo_ai_read(p_store_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store public.stores%rowtype;
  v_day date := (now() at time zone 'America/Sao_Paulo')::date;
  v_reads integer;
begin
  select * into v_store from public.stores where id = p_store_id for update;
  if not found or not public.is_store_member(p_store_id) then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  if v_store.is_demo then
    if v_store.demo_ai_reads >= 3 then return false; end if;
    update public.stores set demo_ai_reads = demo_ai_reads + 1 where id = p_store_id;
    return true;
  end if;
  insert into public.store_ai_reads (store_id, day, reads)
  values (p_store_id, v_day, 1)
  on conflict (store_id, day) do update set reads = public.store_ai_reads.reads + 1
  returning reads into v_reads;
  if v_reads > 20 then
    update public.store_ai_reads set reads = 20 where store_id = p_store_id and day = v_day;
    return false;
  end if;
  return true;
end;
$$;

revoke all on function public.consume_demo_ai_read(uuid) from public, anon;
grant execute on function public.consume_demo_ai_read(uuid) to authenticated;
