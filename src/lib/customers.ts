/** Um cliente da loja (customer_report: um por celular). */
export type CustomerRow = {
  phone: string;
  name: string;
  orders: number;
  cancelled: number;
  total_cents: number;
  first_order_at: string;
  last_order_at: string;
  district: string | null;
};

export type CustomerFilter = "todos" | "fieis" | "novos" | "sumidos";

/** Quantos dias sem pedir para o cliente contar como "sumido". */
export const AWAY_DAYS = 30;
/** A partir de quantos pedidos o cliente é "fiel". */
export const LOYAL_ORDERS = 3;

const DAY = 24 * 60 * 60 * 1000;
const brDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);

/** Dias de calendário (horário de Brasília) entre a data e hoje: ontem à noite = 1. */
export function daysSince(iso: string, now: Date = new Date()) {
  return Math.round((Date.parse(brDay(now)) - Date.parse(brDay(new Date(iso)))) / DAY);
}

export function matchesFilter(c: CustomerRow, filter: CustomerFilter, now: Date = new Date()) {
  if (c.orders === 0) return filter === "todos";
  switch (filter) {
    case "fieis":
      return c.orders >= LOYAL_ORDERS;
    case "novos":
      return daysSince(c.first_order_at, now) < AWAY_DAYS;
    case "sumidos":
      return daysSince(c.last_order_at, now) >= AWAY_DAYS;
    default:
      return true;
  }
}

export function summarizeCustomers(rows: CustomerRow[], now: Date = new Date()) {
  const buyers = rows.filter((c) => c.orders > 0);
  const total = buyers.reduce((n, c) => n + Number(c.total_cents), 0);
  return {
    customers: buyers.length,
    returning: buyers.filter((c) => c.orders >= 2).length,
    loyal: buyers.filter((c) => c.orders >= LOYAL_ORDERS).length,
    newOnes: buyers.filter((c) => matchesFilter(c, "novos", now)).length,
    away: buyers.filter((c) => matchesFilter(c, "sumidos", now)).length,
    avgSpentCents: buyers.length ? Math.round(total / buyers.length) : 0,
  };
}

/** Busca por nome, telefone ou bairro, sem acento. */
export function searchCustomers(rows: CustomerRow[], query: string) {
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const q = norm(query.trim());
  if (!q) return rows;
  const digits = q.replace(/\D/g, "");
  return rows.filter(
    (c) =>
      norm(c.name).includes(q) ||
      norm(c.district ?? "").includes(q) ||
      (digits.length >= 3 && c.phone.includes(digits)),
  );
}

/** Link do WhatsApp do cliente (celular brasileiro sem o 55). */
export function whatsappLink(phone: string, text?: string) {
  const digits = phone.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  return `https://wa.me/55${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
