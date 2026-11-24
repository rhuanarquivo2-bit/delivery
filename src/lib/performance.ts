export type PerformanceReport = {
  orders: number;
  gross_cents: number;
  cancelled_orders: number;
  scheduled_orders: number;
  customers: number;
  new_customers: number;
  avg_accept_minutes: number | null;
  avg_prep_minutes: number | null;
  avg_total_minutes: number | null;
  by_hour: { hour: number; orders: number; cents: number }[];
  by_weekday: { weekday: number; orders: number; cents: number }[];
  top_districts: { name: string; orders: number; cents: number }[];
};

/** Horas do dia com movimento (corta o começo e o fim sem pedidos; mantém os buracos do meio). */
export function activeHours(byHour: PerformanceReport["by_hour"]) {
  const first = byHour.findIndex((h) => h.orders > 0);
  if (first === -1) return [];
  let last = byHour.length - 1;
  while (last > first && byHour[last].orders === 0) last--;
  return byHour.slice(first, last + 1);
}

/** Hora (ou faixa de 2 horas) com mais pedidos: "20h às 22h". */
export function peakWindow(byHour: PerformanceReport["by_hour"]) {
  let best: { start: number; orders: number } | null = null;
  for (let i = 0; i < byHour.length; i++) {
    const orders = byHour[i].orders + (byHour[i + 1]?.orders ?? 0);
    if (orders > 0 && (!best || orders > best.orders)) best = { start: byHour[i].hour, orders };
  }
  if (!best) return null;
  return { label: `${best.start}h às ${(best.start + 2) % 24}h`, orders: best.orders };
}

/** 7.5 -> "7 min"; 75 -> "1h15" */
export function formatDuration(minutes: number | null) {
  if (minutes === null || minutes === undefined) return "—";
  const m = Math.round(Number(minutes));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
}

export function percent(part: number, total: number) {
  return total ? Math.round((part / total) * 100) : 0;
}
