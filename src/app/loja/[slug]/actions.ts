"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { parseBRLToCents } from "@/lib/utils";

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
};

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
  delivery_zone_id: z.string().default(""),
  payment_method: z.enum(["pix_delivery", "card_delivery", "cash"], { message: "Escolha a forma de pagamento." }),
  change_for: z.string().default(""),
  notes: z.string().max(300).default(""),
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
      delivery_zone_id: o.fulfillment === "delivery" ? o.delivery_zone_id || null : null,
      payment_method: o.payment_method,
      change_for_cents: changeFor,
      notes: o.notes,
      items: o.items,
    },
  });

  if (error) {
    return { ok: false, message: ERRORS[error.message] ?? "Não foi possível enviar o pedido. Tente de novo." };
  }
  const result = data as { token: string; number: number };
  return { ok: true, token: result.token, number: result.number };
}
