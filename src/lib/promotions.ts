import { STORE_TIMEZONE } from "./hours";
import type { DiscountKind, LivePromo, Promotion } from "./types";

/** Data (AAAA-MM-DD), dia da semana e minutos desde a meia-noite no fuso da loja. */
export function localMoment(now: Date = new Date(), timeZone = STORE_TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday")),
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

const toMinutes = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

/** Mesma regra do promotion_is_live no banco. */
export function isPromotionLive(p: Promotion, now: Date = new Date()) {
  if (!p.active) return false;
  const { date, weekday, minutes } = localMoment(now);
  if (p.starts_on && date < p.starts_on) return false;
  if (p.ends_on && date > p.ends_on) return false;
  if (p.weekdays && p.weekdays.length && !p.weekdays.includes(weekday)) return false;
  if (p.start_time && p.end_time) {
    const start = toMinutes(p.start_time);
    const end = toMinutes(p.end_time);
    const inside = end > start ? minutes >= start && minutes < end : minutes >= start || minutes < end;
    if (!inside) return false;
  }
  return true;
}

export function discountedPrice(price: number, kind: DiscountKind, value: number) {
  return kind === "percent" ? price - Math.round((price * value) / 100) : Math.max(price - value, 0);
}

/** Melhor preço entre as promoções que valem para o produto (ou o preço cheio). */
export function promoPrice(price: number, promos: LivePromo[] | undefined) {
  let best = { price, name: null as string | null };
  for (const p of promos ?? []) {
    const candidate = discountedPrice(price, p.kind, p.value);
    if (candidate < best.price || (candidate === best.price && best.name !== null && p.name < best.name)) {
      best = { price: candidate, name: p.name };
    }
  }
  return best;
}

export function describeDiscount(kind: DiscountKind, value: number, formatMoney: (cents: number) => string) {
  return kind === "percent" ? `${value}% off` : `${formatMoney(value)} off`;
}

/** Texto curto de quando a promoção vale, ex.: "Ter e Qui · 18:00 às 20:00 · até 30/11". */
export function describeSchedule(p: Pick<Promotion, "weekdays" | "start_time" | "end_time" | "starts_on" | "ends_on">) {
  const short = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const parts: string[] = [];
  if (p.weekdays && p.weekdays.length && p.weekdays.length < 7) {
    parts.push([...p.weekdays].sort().map((d) => short[d]).join(", "));
  } else {
    parts.push("Todos os dias");
  }
  if (p.start_time && p.end_time) parts.push(`${p.start_time.slice(0, 5)} às ${p.end_time.slice(0, 5)}`);
  const br = (d: string) => d.split("-").reverse().slice(0, 2).join("/");
  if (p.starts_on && p.ends_on) parts.push(`${br(p.starts_on)} a ${br(p.ends_on)}`);
  else if (p.starts_on) parts.push(`a partir de ${br(p.starts_on)}`);
  else if (p.ends_on) parts.push(`até ${br(p.ends_on)}`);
  return parts.join(" · ");
}
