-- Fase 1: Fundação
-- Lojas (multi-loja), membros do painel, horários e taxas de entrega por bairro.
-- Valores em dinheiro são guardados em centavos (integer) para evitar erros de arredondamento.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Lojas
-- ---------------------------------------------------------------------------
create table public.stores (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$'),
  name text not null check (char_length(name) between 2 and 80),
  description text check (char_length(description) <= 280),
  phone text,
  whatsapp text,
  address_street text,
  address_number text,
  address_district text,
  address_city text,
  address_state text check (address_state is null or char_length(address_state) = 2),
  logo_url text,
  primary_color text not null default '#E4572E'
    check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  -- null = segue o horário; true/false = aberto/fechado manualmente pelo operador
  open_override boolean,
  min_order_cents integer not null default 0 check (min_order_cents >= 0),
  prep_time_minutes integer not null default 40 check (prep_time_minutes between 5 and 240),
  is_demo boolean not null default false,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Quem acessa o painel de cada loja
-- ---------------------------------------------------------------------------
create type public.store_role as enum ('owner', 'staff');

create table public.store_members (
  store_id uuid not null references public.stores (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.store_role not null default 'staff',
  created_at timestamptz not null default now(),
  primary key (store_id, user_id)
);

create index store_members_user_idx on public.store_members (user_id);

-- ---------------------------------------------------------------------------
-- Horário de funcionamento (0 = domingo ... 6 = sábado).
-- closes_at menor que opens_at significa que fecha depois da meia-noite.
-- ---------------------------------------------------------------------------
create table public.store_hours (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  opens_at time not null,
  closes_at time not null,
  unique (store_id, weekday)
);

-- ---------------------------------------------------------------------------
-- Taxa de entrega por bairro
-- ---------------------------------------------------------------------------
create table public.delivery_zones (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  neighborhood text not null check (char_length(neighborhood) between 2 and 80),
  fee_cents integer not null check (fee_cents >= 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  unique (store_id, neighborhood)
);

create index delivery_zones_store_idx on public.delivery_zones (store_id);

-- ---------------------------------------------------------------------------
-- Funções auxiliares
-- ---------------------------------------------------------------------------
create or replace function public.is_store_member(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.store_members
    where store_id = p_store_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_store_owner(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.store_members
    where store_id = p_store_id and user_id = auth.uid() and role = 'owner'
  );
$$;

-- Quem cria a loja vira dono automaticamente.
create or replace function public.handle_new_store()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.store_members (store_id, user_id, role)
  values (new.id, new.created_by, 'owner');
  return new;
end;
$$;

create trigger on_store_created
  after insert on public.stores
  for each row execute function public.handle_new_store();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger stores_touch_updated_at
  before update on public.stores
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Regras de acesso (RLS)
-- ---------------------------------------------------------------------------
alter table public.stores enable row level security;
alter table public.store_members enable row level security;
alter table public.store_hours enable row level security;
alter table public.delivery_zones enable row level security;

-- Lojas: o site é público, então qualquer pessoa pode ler.
create policy "lojas visíveis para todos" on public.stores
  for select using (true);
create policy "usuário logado cria loja" on public.stores
  for insert to authenticated with check (created_by = auth.uid());
create policy "membros editam a loja" on public.stores
  for update to authenticated
  using (public.is_store_member(id)) with check (public.is_store_member(id));
create policy "dono apaga a loja" on public.stores
  for delete to authenticated using (public.is_store_owner(id));

-- Membros: cada um vê os membros das suas lojas; só o dono gerencia.
create policy "membros veem a equipe" on public.store_members
  for select to authenticated using (public.is_store_member(store_id));
create policy "dono adiciona membros" on public.store_members
  for insert to authenticated with check (public.is_store_owner(store_id));
create policy "dono altera membros" on public.store_members
  for update to authenticated using (public.is_store_owner(store_id));
create policy "dono remove membros" on public.store_members
  for delete to authenticated using (public.is_store_owner(store_id));

-- Horários e bairros: leitura pública (o site mostra), escrita pelos membros.
create policy "horários visíveis para todos" on public.store_hours
  for select using (true);
create policy "membros gerenciam horários" on public.store_hours
  for all to authenticated
  using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));

create policy "bairros visíveis para todos" on public.delivery_zones
  for select using (true);
create policy "membros gerenciam bairros" on public.delivery_zones
  for all to authenticated
  using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));

-- ---------------------------------------------------------------------------
-- Arquivos (logo, fotos de produtos e do cardápio)
-- Caminho esperado: <store_id>/<arquivo>
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('store-assets', 'store-assets', true)
on conflict (id) do nothing;

create policy "arquivos das lojas são públicos" on storage.objects
  for select using (bucket_id = 'store-assets');
create policy "membros enviam arquivos da loja" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'store-assets'
    and public.is_store_member(((storage.foldername(name))[1])::uuid)
  );
create policy "membros alteram arquivos da loja" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'store-assets'
    and public.is_store_member(((storage.foldername(name))[1])::uuid)
  );
create policy "membros apagam arquivos da loja" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'store-assets'
    and public.is_store_member(((storage.foldername(name))[1])::uuid)
  );

-- ---------------------------------------------------------------------------
-- Substituir horários e bairros de uma vez (tudo ou nada).
-- security invoker: as regras de acesso acima continuam valendo.
-- ---------------------------------------------------------------------------
create or replace function public.replace_store_hours(p_store_id uuid, p_rows jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.is_store_member(p_store_id) then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  delete from public.store_hours where store_id = p_store_id;
  insert into public.store_hours (store_id, weekday, opens_at, closes_at)
  select p_store_id, (r->>'weekday')::smallint, (r->>'opens_at')::time, (r->>'closes_at')::time
  from jsonb_array_elements(p_rows) as r;
end;
$$;

create or replace function public.replace_delivery_zones(p_store_id uuid, p_rows jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.is_store_member(p_store_id) then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  delete from public.delivery_zones where store_id = p_store_id;
  insert into public.delivery_zones (store_id, neighborhood, fee_cents, active, sort_order)
  select p_store_id, r->>'neighborhood', (r->>'fee_cents')::integer, (r->>'active')::boolean, (r->>'sort_order')::integer
  from jsonb_array_elements(p_rows) as r;
end;
$$;
