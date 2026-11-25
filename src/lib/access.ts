import type { Store } from "./types";

/** Situação de acesso de uma loja ao sistema (definida pelo administrador da plataforma). */
export type AccessState =
  | { kind: "demo" }
  | { kind: "unlimited" }
  | { kind: "active"; until: Date; daysLeft: number }
  | { kind: "expired"; until: Date }
  | { kind: "blocked"; reason: string | null };

type AccessFields = Pick<Store, "is_demo" | "blocked" | "blocked_reason" | "access_until">;

const DAY = 24 * 60 * 60 * 1000;

export function storeAccess(store: AccessFields, now = new Date()): AccessState {
  if (store.is_demo) return { kind: "demo" };
  if (store.blocked) return { kind: "blocked", reason: store.blocked_reason };
  if (!store.access_until) return { kind: "unlimited" };
  const until = new Date(store.access_until);
  if (until.getTime() <= now.getTime()) return { kind: "expired", until };
  return { kind: "active", until, daysLeft: Math.ceil((until.getTime() - now.getTime()) / DAY) };
}

/** A loja pode receber pedidos e usar o painel agora? */
export function hasAccess(state: AccessState) {
  return state.kind !== "expired" && state.kind !== "blocked";
}

/** Mostra o aviso de "seu acesso termina em breve" no painel do lojista. */
export const WARN_DAYS = 3;

export function formatAccessDate(d: Date) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

/** "hoje", "amanhã" ou "em 5 dias". */
export function daysLeftLabel(days: number) {
  if (days <= 1) return "em menos de 1 dia";
  return `em ${days} dias`;
}

/** Data do campo <input type="date"> (dia de Brasília) -> fim daquele dia, em ISO. */
export function endOfDayBR(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const d = new Date(`${date}T23:59:59-03:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Data em ISO -> valor para <input type="date"> no dia de Brasília. */
export function toDateInputBR(iso: string | null) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));
}

/** Link de WhatsApp a partir dos números (com ou sem 55). */
export function whatsappLink(digits: string | null | undefined, text?: string) {
  if (!digits) return null;
  const n = digits.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (n.length < 10) return null;
  return `https://wa.me/55${n}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
