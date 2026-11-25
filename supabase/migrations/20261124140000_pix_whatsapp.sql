-- Fase 15: "Pix pelo WhatsApp" — Pix sem integração com banco.
-- O cliente escolhe essa forma de pagamento, o pedido entra normalmente no painel e o
-- site leva o cliente ao WhatsApp da loja com o pedido pronto, pedindo a chave Pix.
-- O lojista confere o comprovante no WhatsApp e marca o pedido como pago no painel.

-- Nova forma de pagamento. (Fica num comando só; o valor novo é usado só dentro de
-- funções, então pode rodar tudo de uma vez no SQL Editor.)
alter type public.payment_method add value if not exists 'pix_whatsapp';

alter table public.stores
  -- Liga a opção "Pix pelo WhatsApp" no site da loja (precisa ter WhatsApp cadastrado).
  add column if not exists pix_whatsapp_enabled boolean not null default false;

-- Pedido com Pix pelo WhatsApp só entra se a loja ligou a opção e tem WhatsApp.
create or replace function public.guard_order_pix_whatsapp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.payment_method::text = 'pix_whatsapp' and not exists (
    select 1 from public.stores s
    where s.id = new.store_id and s.pix_whatsapp_enabled and coalesce(btrim(s.whatsapp), '') <> ''
  ) then
    raise exception 'pagamento_indisponivel' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_guard_pix_whatsapp on public.orders;
create trigger orders_guard_pix_whatsapp
  before insert on public.orders
  for each row execute function public.guard_order_pix_whatsapp();

-- Painel: o lojista confirma (ou desfaz) o Pix recebido pelo WhatsApp.
-- Pedido segue como 'on_delivery' (Pix a confirmar) até o lojista marcar como pago.
create or replace function public.set_whatsapp_pix_paid(p_order_id uuid, p_paid boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or not public.is_store_member(v_order.store_id) then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  if v_order.payment_method::text <> 'pix_whatsapp' then
    raise exception 'pagamento_invalido';
  end if;

  update public.orders
    set payment_status = case when p_paid then 'paid' else 'on_delivery' end::public.payment_status,
        paid_at = case when p_paid then coalesce(paid_at, now()) else null end
    where id = p_order_id
    returning * into v_order;
  return to_jsonb(v_order);
end;
$$;

revoke all on function public.set_whatsapp_pix_paid(uuid, boolean) from public, anon;
grant execute on function public.set_whatsapp_pix_paid(uuid, boolean) to authenticated;
