"use server";

import { z } from "zod";
import { isValidDocument, onlyDigits } from "@/lib/document";
import { createPixForOrder, PaymentError, syncOrderPayment } from "@/lib/payments";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { AppliedCoupon } from "@/lib/pricing";
import type { LoyaltyStatus } from "@/lib/loyalty";
import type { OrderSummary } from "@/lib/my-orders";
import type { OrderQuote } from "@/lib/types";
import { formatBRL, parseBRLToCents } from "@/lib/utils";
import { later, notifyNewOrder, orderIdByToken } from "@/lib/push/notify";

const ERRORS: Record<string, string> = {
  loja_nao_encontrada: "Loja não encontrada.",
  loja_fechada: "A loja fechou agora há pouco. Tente no próximo horário de funcionamento.",
  nome_invalido: "Informe seu nome.",
  telefone_invalido: "Informe um telefone com DDD.",
  dados_invalidos: "Confira os dados do pedido.",
  pagamento_indisponivel: "Essa forma de pagamento ainda não está disponível.",
  carrinho_vazio: "Seu carrinho está vazio.",
  quantidade_invalida: "Quantidade inválida.",
  produto_indisponivel: "Um dos produtos acabou de ficar indisponível. Remova-o do carrinho.",
  tamanho_invalido: "Um dos tamanhos escolhidos não está mais disponível.",
  sabores_demais: "Escolha menos sabores para esse tamanho.",
  sabor_indisponivel: "Um dos sabores escolhidos ficou indisponível.",
  adicional_indisponivel: "Um dos adicionais escolhidos ficou indisponível.",
  adicionais_invalidos: "Confira os adicionais obrigatórios dos itens.",
  pedido_minimo: "O pedido ainda não atingiu o valor mínimo da loja.",
  bairro_invalido: "Escolha um bairro de entrega.",
  endereco_invalido: "Informe rua e número para a entrega.",
  troco_invalido: "O valor para troco precisa ser maior que o total do pedido.",
  cupom_invalido: "Cupom não encontrado. Confira o código.",
  cupom_expirado: "Esse cupom não está valendo agora.",
  cupom_esgotado: "Esse cupom já atingiu o limite de usos.",
  cupom_ja_usado: "Você já usou esse cupom.",
  cupom_primeiro_pedido: "Esse cupom é só para o primeiro pedido na loja.",
  cupom_so_entrega: "Esse cupom de entrega grátis vale só para pedidos com entrega.",
  documento_obrigatorio: "Informe seu CPF para pagar com Pix.",
  documento_invalido: "CPF inválido. Confira os números.",
  cep_invalido: "CEP inválido. Confira os 8 números ou deixe em branco.",
  agendamento_indisponivel: "Esta loja não está aceitando pedidos agendados.",
  agendamento_invalido: "Horário de agendamento inválido. Escolha outro.",
  agendamento_cedo: "Esse horário ficou perto demais. Escolha um horário mais tarde.",
  agendamento_longe: "Esse dia está longe demais para agendar. Escolha uma data mais próxima.",
  agendamento_fora_horario: "A loja não funciona nesse horário. Escolha outro.",
  recompensa_invalida: "Essa recompensa não está mais disponível. Escolha outra.",
  pontos_insuficientes: "Você não tem pontos suficientes para essa recompensa.",
  loja_indisponivel: "Esta loja não está recebendo pedidos online no momento.",
  pontos_sem_acesso: "Para usar seus pontos, entre em Meus pedidos com seu celular e senha.",
  muitos_pedidos: "Muitos pedidos seguidos com este celular. Espere alguns minutos e tente de novo.",
};

function errorMessage(error: { message: string; details?: string | null }) {
  if (error.message === "cupom_pedido_minimo" && error.details) {
    return `Esse cupom vale para pedidos a partir de ${formatBRL(Number(error.details))}.`;
  }
  return ERRORS[error.message];
}

const schema = z.object({
  store_id: z.string().uuid(),
  fulfillment: z.enum(["delivery", "pickup"]),
  customer_name: z.string().trim().min(2, "Informe seu nome.").max(80),
  customer_phone: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length >= 10 && v.length <= 13, "Informe um telefone com DDD."),
  address_street: z.string().max(120).default(""),
  address_number: z.string().max(20).default(""),
  address_complement: z.string().max(80).default(""),
  address_reference: z.string().max(120).default(""),
  address_zip: z
    .string()
    .default("")
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v === "" || v.length === 8, "CEP inválido. Confira os 8 números ou deixe em branco."),
  delivery_zone_id: z.string().default(""),
  scheduled_for: z
    .string()
    .default("")
    .refine((v) => v === "" || !Number.isNaN(Date.parse(v)), "Horário de agendamento inválido. Escolha outro."),
  payment_method: z.enum(["pix_online", "pix_whatsapp", "pix_delivery", "card_delivery", "cash"], {
    message: "Escolha a forma de pagamento.",
  }),
  customer_document: z
    .string()
    .default("")
    .transform(onlyDigits)
    .refine((v) => v === "" || isValidDocument(v), "CPF inválido. Confira os números."),
  change_for: z.string().default(""),
  notes: z.string().max(300).default(""),
  coupon_code: z.string().trim().max(20).default(""),
  loyalty_reward_id: z.string().uuid().or(z.literal("")).default(""),
  loyalty_tokens: z.array(z.string().uuid()).max(50).default([]),
  items: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        size_id: z.string().uuid().nullable(),
        flavor_ids: z.array(z.string().uuid()).max(3),
        option_ids: z.array(z.string().uuid()).max(60),
        quantity: z.number().int().min(1).max(50),
        notes: z.string().max(200),
      }),
    )
    .min(1, "Seu carrinho está vazio.")
    .max(60),
});

export type PlaceOrderInput = z.input<typeof schema>;
export type PlaceOrderResult = { ok: true; token: string; number: number } | { ok: false; message: string };

export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const o = parsed.data;

  let changeFor: number | null = null;
  if (o.payment_method === "cash" && o.change_for.trim()) {
    changeFor = parseBRLToCents(o.change_for);
    if (changeFor === null) return { ok: false, message: "Valor para troco inválido." };
  }

  const pixOnline = o.payment_method === "pix_online";
  if (pixOnline && !isAdminConfigured) return { ok: false, message: ERRORS.pagamento_indisponivel };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("place_order", {
    p_store_id: o.store_id,
    p_order: {
      fulfillment: o.fulfillment,
      customer_name: o.customer_name,
      customer_phone: o.customer_phone,
      address_street: o.address_street,
      address_number: o.address_number,
      address_complement: o.address_complement,
      address_reference: o.address_reference,
      address_zip: o.fulfillment === "delivery" ? o.address_zip || null : null,
      delivery_zone_id: o.fulfillment === "delivery" ? o.delivery_zone_id || null : null,
      scheduled_for: o.scheduled_for || null,
      payment_method: o.payment_method,
      customer_document: pixOnline ? o.customer_document || null : null,
      change_for_cents: changeFor,
      notes: o.notes,
      coupon_code: o.coupon_code || null,
      ...(o.loyalty_reward_id ? { loyalty_reward_id: o.loyalty_reward_id, loyalty_tokens: o.loyalty_tokens } : {}),
      items: o.items,
    },
  });

  if (error) {
    return { ok: false, message: errorMessage(error) ?? "Não foi possível enviar o pedido. Tente de novo." };
  }
  const result = data as { id: string; token: string; number: number; total_cents: number };

  if (pixOnline) {
    const { data: store } = await supabase.from("stores").select("name").eq("id", o.store_id).single();
    try {
      await createPixForOrder({
        orderId: result.id,
        storeId: o.store_id,
        storeName: store?.name ?? "Loja",
        orderNumber: result.number,
        amountCents: result.total_cents,
        customer: { name: o.customer_name, phone: o.customer_phone, document: o.customer_document || null },
      });
    } catch (err) {
      const message = err instanceof PaymentError ? err.message : "Não conseguimos gerar o Pix agora.";
      return { ok: false, message };
    }
  } else {
    later(() => notifyNewOrder(result.id));
  }
  return { ok: true, token: result.token, number: result.number };
}

/** Loja de demonstração: faz de conta que o cliente pagou o Pix. */
export async function simulateDemoPix(token: string) {
  if (!z.string().uuid().safeParse(token).success) return false;
  const supabase = await createClient();
  const { data } = await supabase.rpc("demo_pay_pix", { p_token: token });
  if (data) {
    later(async () => {
      const id = await orderIdByToken(token);
      if (id) await notifyNewOrder(id, { pixPaid: true });
    });
  }
  return Boolean(data);
}

/**
 * A página do pedido chama enquanto espera o Pix: confere direto no Mercado Pago/Asaas.
 * Só precisa do link do pedido (o mesmo que o cliente já tem).
 */
export async function checkPixPayment(token: string): Promise<string | null> {
  if (!isAdminConfigured || !z.string().uuid().safeParse(token).success) return null;
  const { data } = await createAdminClient()
    .from("orders")
    .select("id, payment_status")
    .eq("public_token", token)
    .maybeSingle();
  if (!data) return null;
  if (data.payment_status !== "awaiting") return data.payment_status;
  return syncOrderPayment(data.id);
}

const quoteSchema = schema
  .pick({ store_id: true, fulfillment: true, delivery_zone_id: true, items: true })
  .extend({
    coupon_code: z.string().trim().min(1, "Digite o código do cupom.").max(20, "Cupom não encontrado. Confira o código."),
    customer_phone: z.string().default(""),
  });

export type CheckCouponResult = { ok: true; coupon: AppliedCoupon } | { ok: false; message: string };

/** Confere o cupom no banco (validade, limite, primeiro pedido...) sem gravar nada. */
export async function checkCoupon(input: z.input<typeof quoteSchema>): Promise<CheckCouponResult> {
  const parsed = quoteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const o = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("quote_order", {
    p_store_id: o.store_id,
    p_order: {
      fulfillment: o.fulfillment,
      delivery_zone_id: o.fulfillment === "delivery" ? o.delivery_zone_id || null : null,
      customer_phone: o.customer_phone.replace(/\D/g, ""),
      coupon_code: o.coupon_code,
      items: o.items,
    },
  });
  if (error) return { ok: false, message: errorMessage(error) ?? "Não foi possível conferir o cupom agora." };

  const q = data as OrderQuote;
  return {
    ok: true,
    coupon: {
      code: q.coupon_code!,
      kind: q.coupon_kind!,
      value: q.coupon_value ?? 0,
      min_order_cents: q.coupon_min_order_cents ?? 0,
      max_discount_cents: q.coupon_max_discount_cents,
      description: q.coupon_description,
    },
  };
}

/**
 * A página do pedido pergunta a cada poucos segundos: devolve só uma "marca" do estado
 * do pedido. Quando a marca muda, a página se atualiza inteira.
 */
export async function orderStamp(token: string): Promise<string | null> {
  if (!z.string().uuid().safeParse(token).success) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_public_order", { p_token: token });
  const order = data as { status?: string; payment_status?: string; scheduled_for?: string | null } | null;
  if (!order?.status) return null;
  return [order.status, order.payment_status, order.scheduled_for ?? ""].join("|");
}

export type SavedCustomerData = {
  name: string;
  street: string | null;
  number: string | null;
  complement: string | null;
  reference: string | null;
  zoneId: string | null;
  cep: string | null;
  orders: number;
};

/**
 * Checkout: dados do último pedido feito com esse celular nessa loja.
 * Só responde se o aparelho tiver o link de um pedido desse celular (os links ficam guardados
 * no próprio aparelho), para ninguém descobrir o endereço de outra pessoa só pelo número.
 */
export async function lookupCustomer(storeId: string, phone: string, tokens: string[]): Promise<SavedCustomerData | null> {
  const digits = phone.replace(/\D/g, "");
  const ids = z.array(z.string().uuid()).max(50).safeParse(tokens);
  if (!z.string().uuid().safeParse(storeId).success || digits.length < 10 || digits.length > 11) return null;
  if (!ids.success || ids.data.length === 0) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("customer_lookup", { p_store_id: storeId, p_phone: digits, p_tokens: ids.data });
  const row = (Array.isArray(data) ? data[0] : null) as
    | {
        name: string;
        street: string | null;
        number: string | null;
        complement: string | null;
        reference: string | null;
        delivery_zone_id: string | null;
        zip: string | null;
        orders: number;
      }
    | null;
  if (!row?.name) return null;
  return {
    name: row.name,
    street: row.street,
    number: row.number,
    complement: row.complement,
    reference: row.reference,
    zoneId: row.delivery_zone_id,
    cep: row.zip,
    orders: Number(row.orders) || 0,
  };
}

// ---- Meus pedidos -------------------------------------------------------------

const tokenList = z.array(z.string().uuid()).max(50);

/** Pedidos guardados neste aparelho (os links ficam no próprio celular do cliente). */
export async function myOrders(storeId: string, tokens: string[]): Promise<OrderSummary[]> {
  const parsed = tokenList.safeParse(tokens);
  if (!z.string().uuid().safeParse(storeId).success || !parsed.success || !parsed.data.length) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("orders_by_tokens", { p_store_id: storeId, p_tokens: parsed.data });
  return Array.isArray(data) ? (data as OrderSummary[]) : [];
}

export type PinResult = { ok: true } | { ok: false; message: string };

const PIN_ERRORS: Record<string, string> = {
  senha_invalida: "A senha precisa ter 4 números.",
  senha_fraca: "Essa senha é fácil de adivinhar. Escolha outra.",
  pedido_nao_encontrado: "Pedido não encontrado.",
};

/** Cria ou troca a senha do cliente (só com o link de um pedido dele). */
export async function createPin(token: string, pin: string): Promise<PinResult> {
  if (!z.string().uuid().safeParse(token).success) return { ok: false, message: PIN_ERRORS.pedido_nao_encontrado };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_customer_pin", { p_token: token, p_pin: pin });
  if (error) {
    const code = Object.keys(PIN_ERRORS).find((k) => error.message.includes(k));
    return { ok: false, message: code ? PIN_ERRORS[code] : "Não deu para salvar a senha agora. Tente de novo." };
  }
  return { ok: true };
}

export type LoginResult = { ok: true; orders: OrderSummary[] } | { ok: false; message: string };

/** Outro aparelho: celular + senha. */
export async function loginMyOrders(storeId: string, phone: string, pin: string): Promise<LoginResult> {
  const digits = phone.replace(/\D/g, "");
  if (!z.string().uuid().safeParse(storeId).success) return { ok: false, message: "Loja não encontrada." };
  if (digits.length < 10 || digits.length > 11) return { ok: false, message: "Digite o celular com DDD." };
  if (!/^\d{4}$/.test(pin)) return { ok: false, message: "A senha tem 4 números." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("customer_orders_login", { p_store_id: storeId, p_phone: digits, p_pin: pin });
  const r = data as { orders?: OrderSummary[]; error?: string; left?: number; minutes?: number } | null;
  if (error || !r) return { ok: false, message: "Não deu para entrar agora. Tente de novo." };
  if (r.orders) return { ok: true, orders: r.orders };
  if (r.error === "sem_senha") {
    return {
      ok: false,
      message:
        "Esse celular ainda não tem senha. No aparelho onde você fez o pedido, abra o pedido e toque em “Criar senha”.",
    };
  }
  if (r.error === "bloqueado") {
    return { ok: false, message: `Muitas tentativas erradas. Tente de novo em ${r.minutes ?? 15} minutos.` };
  }
  return {
    ok: false,
    message: `Senha incorreta. ${r.left === 1 ? "Mais 1 erro e o acesso fica bloqueado por um tempo." : `Você ainda tem ${r.left} tentativas.`}`,
  };
}

// ---- Sugestões no carrinho ----------------------------------------------------

export type CartSuggestion = { productId: string; reason: "pinned" | "together" | "popular"; sourceProductId: string | null };

/** "Quem pede X costuma levar Y": até 3 produtos para sugerir no checkout. */
export async function cartSuggestions(storeId: string, productIds: string[]): Promise<CartSuggestion[]> {
  const ids = z.array(z.string().uuid()).min(1).max(30).safeParse([...new Set(productIds)]);
  if (!z.string().uuid().safeParse(storeId).success || !ids.success) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("cart_suggestions", { p_store_id: storeId, p_product_ids: ids.data });
  if (!Array.isArray(data)) return [];
  return (data as { product_id: string; reason: CartSuggestion["reason"]; source_product_id: string | null }[]).map((r) => ({
    productId: r.product_id,
    reason: r.reason,
    sourceProductId: r.source_product_id,
  }));
}

// ---- Fidelidade ---------------------------------------------------------------

/** Programa da loja e saldo do cliente (o aparelho prova o celular com os links dos pedidos). */
export async function loyaltyStatus(storeId: string, phone: string | null, tokens: string[]): Promise<LoyaltyStatus> {
  const ids = z.array(z.string().uuid()).max(50).safeParse(tokens);
  if (!z.string().uuid().safeParse(storeId).success || !ids.success) return { enabled: false };
  const digits = phone?.replace(/\D/g, "") ?? "";
  const supabase = await createClient();
  const { data } = await supabase.rpc("loyalty_status", {
    p_store_id: storeId,
    p_phone: digits.length >= 10 ? digits : null,
    p_tokens: ids.data,
  });
  return (data as LoyaltyStatus | null) ?? { enabled: false };
}
