-- Fase 13: controle de acesso das lojas pelo dono da plataforma.
-- * Toda loja nova (menos as de demonstração) ganha um período de teste (padrão 7 dias).
-- * O administrador da plataforma vê todas as lojas, muda a validade, libera sem prazo,
--   bloqueia e desbloqueia.
-- * Loja vencida ou bloqueada não recebe pedidos (o banco recusa) e o painel mostra o aviso.

-- ---------------------------------------------------------------------------
-- Quem administra a plataforma (o dono do sistema, não o dono da loja)
-- ---------------------------------------------------------------------------
create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from anon, authenticated;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Configuração geral (uma linha só)
-- ---------------------------------------------------------------------------
create table public.platform_settings (
  id boolean primary key default true check (id),
  trial_days integer not null default 7 check (trial_days between 0 and 365),
  -- WhatsApp que aparece para o lojista quando o acesso vence ou é bloqueado
  support_whatsapp text check (support_whatsapp is null or support_whatsapp ~ '^[0-9]{10,13}$'),
  updated_at timestamptz not null default now()
);
insert into public.platform_settings (id) values (true) on conflict (id) do nothing;
alter table public.platform_settings enable row level security;
-- o painel do lojista precisa ler o WhatsApp de contato
create policy "configuração visível para todos" on public.platform_settings
  for select using (true);
revoke insert, update, delete on public.platform_settings from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Acesso de cada loja
-- ---------------------------------------------------------------------------
alter table public.stores
  -- até quando a loja pode usar o sistema; null = sem prazo
  add column access_until timestamptz,
  add column blocked boolean not null default false,
  -- mensagem que o lojista vê quando está bloqueado
  add column blocked_reason text check (blocked_reason is null or char_length(blocked_reason) <= 200);

-- Lojas que já existem ganham o período de teste a partir de hoje.
update public.stores
set access_until = now() + make_interval(days => (select trial_days from public.platform_settings))
where not is_demo;

-- Anotações internas do administrador (o lojista não vê).
create table public.store_admin_notes (
  store_id uuid primary key references public.stores (id) on delete cascade,
  note text not null default '' check (char_length(note) <= 1000),
  updated_at timestamptz not null default now()
);
alter table public.store_admin_notes enable row level security;
revoke all on public.store_admin_notes from anon, authenticated;

-- A loja pode funcionar agora?
create or replace function public.store_access_ok(s public.stores)
returns boolean
language sql
stable
as $$
  select s.is_demo or (not s.blocked and (s.access_until is null or s.access_until > now()));
$$;

-- Loja nova: começa o teste. O lojista nunca escolhe a própria validade.
-- Mudanças de validade/bloqueio só pelo administrador (ou pelo servidor).
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
    if new.is_demo then
      new.access_until := null;
    else
      new.access_until := now() + make_interval(days => coalesce((select trial_days from public.platform_settings), 7));
    end if;
    return new;
  end if;

  if (new.access_until is distinct from old.access_until
      or new.blocked is distinct from old.blocked
      or new.blocked_reason is distinct from old.blocked_reason)
     and auth.uid() is not null
     and not public.is_platform_admin() then
    raise exception 'acesso_somente_admin' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger stores_guard_access
  before insert or update on public.stores
  for each row execute function public.guard_store_access();

-- Pedido em loja vencida ou bloqueada: recusado, venha de onde vier.
create or replace function public.guard_order_store_access()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.stores s where s.id = new.store_id and public.store_access_ok(s)
  ) then
    raise exception 'loja_indisponivel' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger orders_guard_store_access
  before insert on public.orders
  for each row execute function public.guard_order_store_access();

-- ---------------------------------------------------------------------------
-- Funções do painel do administrador
-- ---------------------------------------------------------------------------
create or replace function public.admin_require()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
end;
$$;

-- Todas as lojas (menos as de demonstração) com dono, pedidos e situação.
create or replace function public.admin_list_stores()
returns table (
  id uuid,
  slug text,
  name text,
  created_at timestamptz,
  access_until timestamptz,
  blocked boolean,
  blocked_reason text,
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
    s.id, s.slug, s.name, s.created_at, s.access_until, s.blocked, s.blocked_reason,
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

-- Soma dias à validade (a partir de hoje, se já venceu).
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
  set access_until = greatest(coalesce(access_until, now()), now()) + make_interval(days => p_days)
  where id = p_store_id and not is_demo
  returning access_until into v_until;
  if not found then raise exception 'loja_nao_encontrada'; end if;
  return v_until;
end;
$$;

-- Define a validade exata (null = sem prazo).
create or replace function public.admin_set_store_until(p_store_id uuid, p_until timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_require();
  update public.stores set access_until = p_until where id = p_store_id and not is_demo;
  if not found then raise exception 'loja_nao_encontrada'; end if;
end;
$$;

-- Bloqueia ou desbloqueia (a validade continua a mesma).
create or replace function public.admin_set_store_blocked(p_store_id uuid, p_blocked boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_require();
  update public.stores
  set blocked = p_blocked,
      blocked_reason = case when p_blocked then nullif(left(trim(coalesce(p_reason, '')), 200), '') else null end
  where id = p_store_id and not is_demo;
  if not found then raise exception 'loja_nao_encontrada'; end if;
end;
$$;

create or replace function public.admin_save_note(p_store_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_require();
  insert into public.store_admin_notes (store_id, note, updated_at)
  values (p_store_id, left(coalesce(p_note, ''), 1000), now())
  on conflict (store_id) do update set note = excluded.note, updated_at = now();
end;
$$;

create or replace function public.admin_save_settings(p_trial_days integer, p_support_whatsapp text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_require();
  update public.platform_settings
  set trial_days = p_trial_days,
      support_whatsapp = nullif(regexp_replace(coalesce(p_support_whatsapp, ''), '\D', '', 'g'), ''),
      updated_at = now()
  where id;
end;
$$;

revoke execute on function public.admin_list_stores() from anon;
revoke execute on function public.admin_extend_store(uuid, integer) from anon;
revoke execute on function public.admin_set_store_until(uuid, timestamptz) from anon;
revoke execute on function public.admin_set_store_blocked(uuid, boolean, text) from anon;
revoke execute on function public.admin_save_note(uuid, text) from anon;
revoke execute on function public.admin_save_settings(integer, text) from anon;
