import { describe, expect, it } from "vitest";
import { isOpenNow } from "../hours";
import type { StoreHour } from "../types";

const h = (weekday: number, opens_at: string, closes_at: string): StoreHour => ({
  id: String(weekday),
  store_id: "s",
  weekday,
  opens_at,
  closes_at,
});

// Datas em UTC; São Paulo = UTC-3. 2026-11-27 é sexta-feira (5).
const sp = (iso: string) => new Date(`${iso}-03:00`);

describe("isOpenNow", () => {
  const hours = [h(5, "18:00:00", "02:00:00"), h(6, "11:00:00", "15:00:00")];

  it("abre no horário do dia", () => {
    expect(isOpenNow(hours, null, sp("2026-11-27T19:30"))).toBe(true);
    expect(isOpenNow(hours, null, sp("2026-11-27T17:59"))).toBe(false);
  });

  it("continua aberta depois da meia-noite", () => {
    expect(isOpenNow(hours, null, sp("2026-11-28T01:30"))).toBe(true);
    expect(isOpenNow(hours, null, sp("2026-11-28T02:00"))).toBe(false);
  });

  it("respeita o horário de sábado sem cruzar a meia-noite", () => {
    expect(isOpenNow(hours, null, sp("2026-11-28T12:00"))).toBe(true);
    expect(isOpenNow(hours, null, sp("2026-11-28T15:00"))).toBe(false);
  });

  it("abertura manual vence o horário", () => {
    expect(isOpenNow(hours, true, sp("2026-11-24T10:00"))).toBe(true);
    expect(isOpenNow(hours, false, sp("2026-11-27T19:30"))).toBe(false);
  });
});
