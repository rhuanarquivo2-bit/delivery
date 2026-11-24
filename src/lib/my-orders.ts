import type { Fulfillment, OrderStatus, PaymentStatus } from "./types";

/** Resumo de um pedido na tela "Meus pedidos". */
export type OrderSummary = {
  token: string;
  number: number;
  status: OrderStatus;
  fulfillment: Fulfillment;
  payment_status: PaymentStatus;
  total_cents: number;
  created_at: string;
  scheduled_for: string | null;
  items: string[];
};

const MAX = 50;
const key = (slug: string) => `pedidos:${slug}`;
const TOKEN = /^[0-9a-f-]{36}$/i;

/** Links (tokens) dos pedidos feitos neste aparelho, do mais novo para o mais antigo. */
export function loadOrderTokens(slug: string): string[] {
  try {
    const list = JSON.parse(window.localStorage.getItem(key(slug)) ?? "[]");
    return Array.isArray(list) ? list.filter((t): t is string => typeof t === "string" && TOKEN.test(t)).slice(0, MAX) : [];
  } catch {
    return [];
  }
}

/** Guarda os pedidos no aparelho (sem repetir; os novos vão para o começo). */
export function rememberOrders(slug: string, tokens: string[]) {
  const merged = [...tokens.filter((t) => TOKEN.test(t)), ...loadOrderTokens(slug)];
  const unique = [...new Set(merged.map((t) => t.toLowerCase()))].slice(0, MAX);
  try {
    window.localStorage.setItem(key(slug), JSON.stringify(unique));
  } catch {
    // sem espaço / aba anônima: segue sem guardar
  }
  return unique;
}

/** Pedido ainda em andamento (aparece em destaque). */
export function isActiveOrder(o: Pick<OrderSummary, "status" | "payment_status">) {
  return o.status !== "delivered" && o.status !== "cancelled" && o.payment_status !== "expired";
}

/** Separa em andamento e anteriores, cada um do mais novo para o mais antigo. */
export function splitOrders(orders: OrderSummary[]) {
  const sorted = [...orders].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return { active: sorted.filter(isActiveOrder), past: sorted.filter((o) => !isActiveOrder(o)) };
}

/** Senha de 4 dígitos que não seja óbvia (o banco confere a mesma regra). */
export function pinProblem(pin: string): string | null {
  if (!/^\d{4}$/.test(pin)) return "A senha precisa ter 4 números.";
  if (/^(\d)\1{3}$/.test(pin) || ["1234", "4321", "0123"].includes(pin)) return "Essa senha é fácil de adivinhar. Escolha outra.";
  return null;
}
