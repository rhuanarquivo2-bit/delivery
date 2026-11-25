-- Fase 14: lojas em teste grátis x pagantes, e apagar loja pela Administração.

alter table public.stores
  -- false = em teste grátis; true = cliente pagante (o administrador liberou prazo)
  add column paid boolean not null default false;

-- Lojas que você já liberou além do teste (sem prazo ou prazo longo) contam como pagantes.
update public.stores
set paid = true
where not is_demo
  and (access_until is null
       or access_until > now() + make_interval(days => (select trial_days from public.platform_settings) + 1));

-- O lojista também não muda o "pagante".
create or replace function public.guard_store_access()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.blocked := false;
    new.blocked_reason := null;
    new.paid := false;
    if new.is_demo then
      new.access_until := null;
    else
      new.access_until := now() + make_interval(days => coalesce((select trial_days from public.platform_settings), 7));
    end if;
    return new;
  end if;

  if (new.access_until is distinct from old.access_until
      or new.blocked is distinct from old.blocked
      or new.blocked_reason is distinct from old.blocked_reason
      or new.paid is distinct from old.paid)
     and auth.uid() is not null
     and not public.is_platform_admin() then
    raise exception 'acesso_somente_admin' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Lista com a coluna "paid" (o formato da resposta mudou, então recria).
drop function if exists public.admin_list_stores();
create function public.admin_list_stores()
returns table (
  id uuid,
  slug text,
  name text,
  created_at timestamptz,
  access_until timestamptz,
  blocked boolean,
  blocked_reason text,
  paid boolean,
  owner_email text,
  phone text,
  whatsapp text,
  orders_total bigint,
  orders_30d bigint,
  last_order_at timestamptz,
  note text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.admin_require();
  return query
  select
    s.id, s.slug, s.name, s.created_at, s.access_until, s.blocked, s.blocked_reason, s.paid,
    (select u.email::text from public.store_members m join auth.users u on u.id = m.user_id
      where m.store_id = s.id and m.role = 'owner' order by m.created_at limit 1),
    s.phone, s.whatsapp,
    (select count(*) from public.orders o where o.store_id = s.id),
    (select count(*) from public.orders o where o.store_id = s.id and o.created_at > now() - interval '30 days'),
    (select max(o.created_at) from public.orders o where o.store_id = s.id),
    (select n.note from public.store_admin_notes n where n.store_id = s.id)
  from public.stores s
  where not s.is_demo
  order by s.created_at desc;
end;
$$;
revoke execute on function public.admin_list_stores() from anon;

-- Dar prazo (+dias, data ou sem prazo) transforma a loja em pagante.
create or replace function public.admin_extend_store(p_store_id uuid, p_days integer)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_until timestamptz;
begin
  perform public.admin_require();
  if p_days is null or p_days not between 1 and 3660 then
    raise exception 'dias_invalidos';
  end if;
  update public.stores
  set access_until = greatest(coalesce(access_until, now()), now()) + make_interval(days => p_days),
      paid = true
  where id = p_store_id and not is_demo
  returning access_until into v_until;
  if not found then raise exception 'loja_nao_encontrada'; end if;
  return v_until;
end;
$$;

create or replace function public.admin_set_store_until(p_store_id uuid, p_until timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_require();
  update public.stores set access_until = p_until, paid = true where id = p_store_id and not is_demo;
  if not found then raise exception 'loja_nao_encontrada'; end if;
end;
$$;

-- Marcar/desmarcar como pagante à mão (a validade não muda).
create or replace function public.admin_set_store_paid(p_store_id uuid, p_paid boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_require();
  update public.stores set paid = coalesce(p_paid, false) where id = p_store_id and not is_demo;
  if not found then raise exception 'loja_nao_encontrada'; end if;
end;
$$;
revoke execute on function public.admin_set_store_paid(uuid, boolean) from anon;

-- Apagar a loja e tudo dela (cardápio, pedidos, clientes, motoboys...). Não tem volta.
-- Para evitar engano, é preciso informar o endereço (slug) da loja.
create or replace function public.admin_delete_store(p_store_id uuid, p_confirm_slug text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_require();
  delete from public.stores
  where id = p_store_id and not is_demo and slug = lower(trim(coalesce(p_confirm_slug, '')));
  if not found then raise exception 'confirmacao_invalida'; end if;
end;
$$;
revoke execute on function public.admin_delete_store(uuid, text) from anon;
