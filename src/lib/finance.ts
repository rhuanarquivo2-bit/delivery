import type { PaymentMethod } from "./types";

export type FinanceReport = {
  orders: number;
  gross_cents: number;
  subtotal_cents: number;
  delivery_fee_cents: number;
  discount_cents: number;
  delivery_orders: number;
  pickup_orders: number;
  cancelled_orders: number;
  cancelled_cents: number;
  open_orders: number;
  cash_change_cents: number;
  by_method: Partial<Record<PaymentMethod, { orders: number; cents: number }>>;
  by_day: { day: string; orders: number; cents: number }[];
  top_products: { name: string; quantity: number; cents: number }[];
  coupons: { code: string; orders: number; cents: number }[];
};

export const PERIODS = [
  { key: "hoje", label: "Hoje" },
  { key: "ontem", label: "Ontem" },
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
  { key: "mes", label: "Este mês" },
  { key: "mes-passado", label: "Mês passado" },
] as const;

export type Period = { from: string; to: string; key: string };

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Dia de hoje em Brasília (AAAA-MM-DD). */
export function todayBR(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
}

export function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);
}

/** Período escolhido na tela (?periodo=7d ou ?de=...&ate=...). Padrão: hoje. */
export function resolvePeriod(params: { periodo?: string; de?: string; ate?: string }, now = new Date()): Period {
  const today = todayBR(now);
  const { de, ate } = params;
  if (de && ate && ISO_DAY.test(de) && ISO_DAY.test(ate) && de <= ate && daysBetween(de, ate) <= 366) {
    return { from: de, to: ate, key: "personalizado" };
  }
  switch (params.periodo) {
    case "ontem":
      return { from: addDays(today, -1), to: addDays(today, -1), key: "ontem" };
    case "7d":
      return { from: addDays(today, -6), to: today, key: "7d" };
    case "30d":
      return { from: addDays(today, -29), to: today, key: "30d" };
    case "mes":
      return { from: `${today.slice(0, 8)}01`, to: today, key: "mes" };
    case "mes-passado": {
      const lastDay = addDays(`${today.slice(0, 8)}01`, -1);
      return { from: `${lastDay.slice(0, 8)}01`, to: lastDay, key: "mes-passado" };
    }
    default:
      return { from: today, to: today, key: "hoje" };
  }
}

/** Um ponto por dia do período (dias sem venda ficam com zero). */
export function fillDays(byDay: FinanceReport["by_day"], from: string, to: string) {
  const map = new Map(byDay.map((d) => [d.day, d]));
  const out: FinanceReport["by_day"] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    out.push(map.get(day) ?? { day, orders: 0, cents: 0 });
  }
  return out;
}

/** "24/11" ou "24/11/2026" */
export function formatDay(day: string, withYear = false) {
  const [y, m, d] = day.split("-");
  return withYear ? `${d}/${m}/${y}` : `${d}/${m}`;
}

/** Valor em reais para planilha brasileira: 1234,50 */
export function csvMoney(cents: number) {
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function csvCell(value: string | number | null | undefined) {
  const s = value === null || value === undefined ? "" : String(value);
  // evita fórmula no Excel (=, +, -, @) e escapa aspas/separador
  const safe = /^[=+\-@]/.test(s) && !/^-?\d+(,\d+)?$/.test(s) ? `'${s}` : s;
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
