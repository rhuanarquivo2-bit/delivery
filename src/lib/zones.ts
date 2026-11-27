import { normalizePlace } from "./cep";
import { parseBRLToCents } from "./utils";

/** Texto que a loja escreve na taxa para dizer que não entrega no bairro. */
export const NOT_SERVED_LABEL = "não atende";
const NOT_SERVED = new Set([
  "nao atende",
  "nao atendemos",
  "nao atendo",
  "nao entrega",
  "nao entregamos",
  "nao entrego",
  "sem entrega",
  "fora",
  "fechado",
  "x",
  "nao",
]);
const FREE = new Set(["gratis", "gratuito", "gratuita", "free", "0"]);

export type ZoneFee = { ok: true; served: true; cents: number } | { ok: true; served: false } | { ok: false };

/**
 * Lê a taxa digitada pela loja: "5,00", "R$ 5", "5.5", vazio ou "grátis" (= R$ 0,00) e
 * "não atende" / "não entrega" / "-" (= a loja não entrega nesse bairro).
 */
export function parseZoneFee(input: string): ZoneFee {
  const text = input.trim();
  if (text === "") return { ok: true, served: true, cents: 0 };
  if (text === "-" || text === "—") return { ok: true, served: false };
  const words = normalizePlace(text);
  if (NOT_SERVED.has(words)) return { ok: true, served: false };
  if (FREE.has(words)) return { ok: true, served: true, cents: 0 };
  // só número (com R$, vírgula ou ponto): nada de letras misturadas ("10 reais" passa, "abc" não)
  if (/[a-z]/.test(words.replace(/\b(r|reais|real)\b/g, ""))) return { ok: false };
  const cents = parseBRLToCents(text);
  return cents === null ? { ok: false } : { ok: true, served: true, cents };
}

export function feeInputFor(zone: { fee_cents: number; active: boolean }) {
  if (!zone.active) return NOT_SERVED_LABEL;
  return zone.fee_cents ? (zone.fee_cents / 100).toFixed(2).replace(".", ",") : "";
}
