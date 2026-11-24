import type { StoreHour } from "./types";

export const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"] as const;

export const STORE_TIMEZONE = "America/Sao_Paulo";

function toMinutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Dia da semana (0-6) e minutos desde a meia-noite no fuso da loja. */
export function localNow(now: Date = new Date(), timeZone = STORE_TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { weekday, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

/**
 * A loja está aberta agora?
 * - `override` true/false vence o horário (o operador abriu ou fechou manualmente).
 * - Horário que passa da meia-noite (ex.: 18:00 às 02:00) continua valendo na madrugada seguinte.
 */
export function isOpenNow(hours: StoreHour[], override: boolean | null, now: Date = new Date()) {
  if (override !== null) return override;
  const { weekday, minutes } = localNow(now);
  const yesterday = (weekday + 6) % 7;

  return hours.some((h) => {
    const open = toMinutes(h.opens_at);
    const close = toMinutes(h.closes_at);
    const crossesMidnight = close <= open;
    if (h.weekday === weekday) {
      return crossesMidnight ? minutes >= open : minutes >= open && minutes < close;
    }
    if (h.weekday === yesterday && crossesMidnight) {
      return minutes < close;
    }
    return false;
  });
}

/** "18:00:00" -> "18:00" */
export function shortTime(time: string) {
  return time.slice(0, 5);
}
