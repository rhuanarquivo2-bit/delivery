import { STORE_TIMEZONE } from "./hours";
import { localMoment } from "./promotions";
import type { StoreHour } from "./types";

/** Os horários do agendamento andam de 15 em 15 minutos (o banco confere a mesma regra). */
export const SLOT_MINUTES = 15;

const SHORT_WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

const toMinutes = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

/** O horário cadastrado cobre esse dia da semana e minuto? (mesma regra de store_hours_cover) */
export function hoursCover(hours: StoreHour[], weekday: number, minutes: number) {
  const yesterday = (weekday + 6) % 7;
  return hours.some((h) => {
    const open = toMinutes(h.opens_at);
    const close = toMinutes(h.closes_at);
    const crossesMidnight = close <= open;
    if (h.weekday === weekday) return crossesMidnight ? minutes >= open : minutes >= open && minutes < close;
    if (h.weekday === yesterday && crossesMidnight) return minutes < close;
    return false;
  });
}

/** Diferença do fuso para o UTC, em minutos, num instante (São Paulo = -180). */
function offsetMinutes(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((asUtc - Math.floor(at.getTime() / 60000) * 60000) / 60000);
}

/** "2026-11-28" + 20:00 no fuso da loja -> instante (Date). */
export function zonedTime(date: string, minutes: number, timeZone = STORE_TIMEZONE) {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
  const first = guess - offsetMinutes(new Date(guess), timeZone) * 60000;
  // confere de novo perto de mudança de horário de verão
  return new Date(guess - offsetMinutes(new Date(first), timeZone) * 60000);
}

/** "2026-11-28" -> "2026-11-29" */
export function nextDate(date: string, n = 1) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

const weekdayOf = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

export const formatMinutes = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

export type ScheduleSlot = { value: string; label: string };
export type ScheduleDay = { date: string; label: string; slots: ScheduleSlot[] };

/**
 * Dias e horários que o cliente pode escolher para receber o pedido.
 * - do momento atual + tempo de preparo em diante;
 * - dentro do horário de funcionamento;
 * - até `daysAhead` dias depois de hoje (0 = só hoje);
 * - loja fechada manualmente (`override === false`) não recebe agendamento para hoje.
 */
export function scheduleOptions({
  hours,
  override,
  prepMinutes,
  daysAhead,
  now = new Date(),
}: {
  hours: StoreHour[];
  override: boolean | null;
  prepMinutes: number;
  daysAhead: number;
  now?: Date;
}): ScheduleDay[] {
  const today = localMoment(now).date;
  const earliest = now.getTime() + prepMinutes * 60000;
  const days: ScheduleDay[] = [];

  for (let i = 0; i <= daysAhead; i++) {
    const date = nextDate(today, i);
    if (i === 0 && override === false) continue;
    const weekday = weekdayOf(date);
    const slots: ScheduleSlot[] = [];
    for (let minutes = 0; minutes < 24 * 60; minutes += SLOT_MINUTES) {
      if (!hoursCover(hours, weekday, minutes)) continue;
      const at = zonedTime(date, minutes);
      if (at.getTime() < earliest) continue;
      slots.push({ value: at.toISOString(), label: formatMinutes(minutes) });
    }
    if (!slots.length) continue;
    const [, m, d] = date.split("-");
    const label = i === 0 ? "Hoje" : i === 1 ? "Amanhã" : `${SHORT_WEEKDAYS[weekday]}, ${d}/${m}`;
    days.push({ date, label, slots });
  }
  return days;
}

/** "Hoje às 20:00", "Amanhã às 12:30", "sáb., 29/11 às 20:00" (no fuso da loja). */
export function formatScheduled(iso: string, now: Date = new Date()) {
  const at = new Date(iso);
  const day = localMoment(at).date;
  const today = localMoment(now).date;
  const time = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: STORE_TIMEZONE }).format(at);
  if (day === today) return `Hoje às ${time}`;
  if (day === nextDate(today)) return `Amanhã às ${time}`;
  const date = new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    timeZone: STORE_TIMEZONE,
  }).format(at);
  return `${date} às ${time}`;
}
