-- Fase 9: "Meus pedidos" no site do cliente.
-- - O aparelho guarda os links (tokens) dos pedidos feitos nele e mostra a lista.
-- - Para ver em outro aparelho: celular + senha de 4 dígitos. A senha só pode ser
--   criada (ou trocada) por quem tem o link de um pedido daquele celular.
-- - Erros de senha bloqueiam o número por um tempo que cresce a cada 5 erros.

create table public.customer_pins (
  store_id uuid not null references public.stores (id) on delete cascade,
  phone text not null check (phone ~ '^[0-9]{10,11}$'),
  pin_hash text not null,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (store_id, phone)
);
-- Ninguém lê nem escreve direto: só pelas funções abaixo.
alter table public.customer_pins enable row level security;

-- Resumo de um pedido para a lista do cliente.
create or replace function public.order_summary(o public.orders)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'token', o.public_token,
    'number', o.number,
    'status', o.status,
    'fulfillment', o.fulfillment,
    'payment_status', o.payment_status,
    'total_cents', o.total_cents,
    'created_at', o.created_at,
    'scheduled_for', o.scheduled_for,
    'items', (
      select coalesce(jsonb_agg(i.quantity || 'x ' || i.product_name order by i.sort_order), '[]'::jsonb)
      from public.order_items i where i.order_id = o.id
    )
  );
$$;
revoke all on function public.order_summary(public.orders) from public;

-- Pedidos guardados no aparelho (cada token é o link secreto do pedido).
create or replace function public.orders_by_tokens(p_store_id uuid, p_tokens uuid[])
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(public.order_summary(o) order by o.created_at desc), '[]'::jsonb)
  from public.orders o
  where o.store_id = p_store_id
    and o.public_token = any (p_tokens[1:50]);
$$;

-- O celular do pedido já tem senha?
create or replace function public.customer_pin_status(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'has_pin', exists (select 1 from public.customer_pins c where c.store_id = o.store_id and c.phone = o.customer_phone),
    'phone_end', right(o.customer_phone, 4)
  )
  from public.orders o
  where o.public_token = p_token;
$$;

-- Cria ou troca a senha. Precisa do link de um pedido daquele celular.
create or replace function public.set_customer_pin(p_token uuid, p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_order public.orders;
begin
  if coalesce(p_pin, '') !~ '^[0-9]{4}$' then
    raise exception 'senha_invalida' using errcode = 'P0001';
  end if;
  if p_pin in ('0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '1234', '4321', '0123') then
    raise exception 'senha_fraca' using errcode = 'P0001';
  end if;
  select * into v_order from public.orders where public_token = p_token;
  if not found then
    raise exception 'pedido_nao_encontrado' using errcode = 'P0001';
  end if;
  insert into public.customer_pins (store_id, phone, pin_hash)
  values (v_order.store_id, v_order.customer_phone, crypt(p_pin, gen_salt('bf', 8)))
  on conflict (store_id, phone) do update
    set pin_hash = excluded.pin_hash, failed_attempts = 0, locked_until = null, updated_at = now();
  return true;
end;
$$;

-- Entrar em outro aparelho: celular + senha. Devolve os pedidos (com os links).
-- Não usa "raise" nos erros de senha para que a contagem de tentativas fique gravada.
create or replace function public.customer_orders_login(p_store_id uuid, p_phone text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_pin public.customer_pins;
  v_wait integer;
begin
  select * into v_pin from public.customer_pins where store_id = p_store_id and phone = v_phone for update;
  if not found then
    return jsonb_build_object('error', 'sem_senha');
  end if;
  if v_pin.locked_until is not null and v_pin.locked_until > now() then
    return jsonb_build_object('error', 'bloqueado', 'minutes', ceil(extract(epoch from v_pin.locked_until - now()) / 60));
  end if;
  if coalesce(p_pin, '') !~ '^[0-9]{4}$' or v_pin.pin_hash <> crypt(p_pin, v_pin.pin_hash) then
    v_wait := case
      when (v_pin.failed_attempts + 1) % 5 = 0 then least(15 * power(2, (v_pin.failed_attempts + 1) / 5 - 1), 1440)::integer
      else 0 end;
    update public.customer_pins
      set failed_attempts = failed_attempts + 1,
          locked_until = case when v_wait > 0 then now() + make_interval(mins => v_wait) else locked_until end
      where store_id = p_store_id and phone = v_phone;
    return case when v_wait > 0
      then jsonb_build_object('error', 'bloqueado', 'minutes', v_wait)
      else jsonb_build_object('error', 'senha_incorreta', 'left', 5 - (v_pin.failed_attempts + 1) % 5) end;
  end if;
  update public.customer_pins set failed_attempts = 0, locked_until = null
    where store_id = p_store_id and phone = v_phone;
  return jsonb_build_object('orders', (
    select coalesce(jsonb_agg(public.order_summary(o) order by o.created_at desc), '[]'::jsonb)
    from (
      select * from public.orders
      where store_id = p_store_id and customer_phone = v_phone
      order by created_at desc limit 30
    ) o
  ));
end;
$$;

revoke all on function public.orders_by_tokens(uuid, uuid[]) from public;
revoke all on function public.customer_pin_status(uuid) from public;
revoke all on function public.set_customer_pin(uuid, text) from public;
revoke all on function public.customer_orders_login(uuid, text, text) from public;
grant execute on function public.orders_by_tokens(uuid, uuid[]) to anon, authenticated;
grant execute on function public.customer_pin_status(uuid) to anon, authenticated;
grant execute on function public.set_customer_pin(uuid, text) to anon, authenticated;
grant execute on function public.customer_orders_login(uuid, text, text) to anon, authenticated;
