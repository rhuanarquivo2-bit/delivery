"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const ERRORS: Record<string, string> = {
  link_invalido: "Este link não vale mais. Peça um novo para a loja.",
  pedido_nao_encontrado: "Esse pedido não está mais com você.",
  status_invalido: "Esse pedido mudou de situação. A tela foi atualizada.",
};

/** Motoboy avisa que saiu para a entrega ou que entregou. */
export async function courierAction(token: string, orderId: string, action: "dispatch" | "deliver") {
  if (!z.string().uuid().safeParse(token).success || !z.string().uuid().safeParse(orderId).success) {
    return { ok: false as const, message: "Link inválido." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("courier_update", { p_token: token, p_order_id: orderId, p_action: action });
  if (error) return { ok: false as const, message: ERRORS[error.message] ?? "Não deu certo. Tente de novo." };
  return { ok: true as const };
}
