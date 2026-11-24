import { describe, expect, it } from "vitest";
import { formatScheduled, hoursCover, nextDate, scheduleOptions, zonedTime } from "../schedule";
import type { StoreHour } from "../types";

const h = (weekday: number, opens_at: string, closes_at: string): StoreHour => ({
  id: String(weekday),
  store_id: "s",
  weekday,
  opens_at,
  closes_at,
});

// São Paulo = UTC-3. 2026-11-27 é sexta-feira (5).
const sp = (iso: string) => new Date(`${iso}-03:00`);

describe("hoursCover", () => {
  const hours = [h(5, "18:00:00", "02:00:00")];
  it("vale no dia e na madrugada seguinte", () => {
    expect(hoursCover(hours, 5, 18 * 60)).toBe(true);
    expect(hoursCover(hours, 6, 60)).toBe(true);
    expect(hoursCover(hours, 6, 2 * 60)).toBe(false);
    expect(hoursCover(hours, 5, 17 * 60 + 45)).toBe(false);
  });
});

describe("zonedTime", () => {
  it("converte o horário da loja para UTC", () => {
    expect(zonedTime("2026-11-27", 20 * 60).toISOString()).toBe("2026-11-27T23:00:00.000Z");
    expect(zonedTime("2026-11-27", 23 * 60 + 30).toISOString()).toBe("2026-11-28T02:30:00.000Z");
  });
  it("avança o dia", () => {
    expect(nextDate("2026-11-30")).toBe("2026-12-01");
    expect(nextDate("2026-12-31", 2)).toBe("2027-01-02");
  });
});

describe("scheduleOptions", () => {
  const hours = [h(5, "18:00:00", "23:00:00"), h(6, "11:00:00", "14:00:00")];

  it("começa depois do tempo de preparo e anda de 15 em 15 minutos", () => {
    const days = scheduleOptions({ hours, override: null, prepMinutes: 40, daysAhead: 1, now: sp("2026-11-27T19:07") });
    expect(days.map((d) => d.label)).toEqual(["Hoje", "Amanhã"]);
    // 19:07 + 40 min = 19:47 -> primeiro horário 20:00
    expect(days[0].slots[0].label).toBe("20:00");
    expect(days[0].slots.at(-1)!.label).toBe("22:45");
    expect(days[1].slots[0]).toEqual({ value: "2026-11-28T14:00:00.000Z", label: "11:00" });
    expect(days[1].slots.at(-1)!.label).toBe("13:45");
  });

  it("pula os dias sem horário e respeita o limite de dias", () => {
    const days = scheduleOptions({ hours, override: null, prepMinutes: 30, daysAhead: 7, now: sp("2026-11-28T15:00") });
    // sábado já passou do horário; os próximos são a sexta e o sábado seguintes
    expect(days.map((d) => d.date)).toEqual(["2026-12-04", "2026-12-05"]);
    expect(days[0].date).toBe("2026-12-04");
    expect(days[0].label).toBe("Sex, 04/12");
  });

  it("loja fechada manualmente não agenda para hoje", () => {
    const days = scheduleOptions({ hours, override: false, prepMinutes: 30, daysAhead: 1, now: sp("2026-11-27T12:00") });
    expect(days.map((d) => d.label)).toEqual(["Amanhã"]);
  });

  it("só hoje quando o limite é 0", () => {
    const days = scheduleOptions({ hours, override: null, prepMinutes: 30, daysAhead: 0, now: sp("2026-11-27T12:00") });
    expect(days.map((d) => d.label)).toEqual(["Hoje"]);
    expect(days[0].slots[0].label).toBe("18:00");
  });
});

describe("formatScheduled", () => {
  const now = sp("2026-11-27T12:00");
  it("escreve hoje, amanhã ou a data", () => {
    expect(formatScheduled("2026-11-27T23:00:00Z", now)).toBe("Hoje às 20:00");
    expect(formatScheduled("2026-11-28T14:30:00Z", now)).toBe("Amanhã às 11:30");
    expect(formatScheduled("2026-12-04T23:00:00Z", now)).toMatch(/04\/12 às 20:00$/);
  });
});
