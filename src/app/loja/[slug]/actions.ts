"use server";

import { z } from "zod";
import { isValidDocument, onlyDigits } from "@/lib/document";
import { createPixForOrder, PaymentError, syncOrderPayment } from "@/lib/payments";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { AppliedCoupon } from "@/lib/pricing";
import type { OrderQuote } from "@/lib/types";
import { formatBRL, parseBRLToCents } from "@/lib/utils";

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
  payment_method: z.enum(["pix_online", "pix_delivery", "card_delivery", "cash"], {
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
  }
  return { ok: true, token: result.token, number: result.number };
}

/** Loja de demonstração: faz de conta que o cliente pagou o Pix. */
export async function simulateDemoPix(token: string) {
  if (!z.string().uuid().safeParse(token).success) return false;
  const supabase = await createClient();
  const { data } = await supabase.rpc("demo_pay_pix", { p_token: token });
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
