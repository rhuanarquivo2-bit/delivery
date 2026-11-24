import { describe, expect, it } from "vitest";
import { activeHours, formatDuration, peakWindow, percent } from "../performance";

const hours = Array.from({ length: 24 }, (_, hour) => ({
  hour,
  orders: ({ 11: 2, 12: 3, 19: 4, 20: 6, 21: 5 } as Record<number, number>)[hour] ?? 0,
  cents: 0,
}));

describe("desempenho", () => {
  it("corta as horas sem movimento nas pontas", () => {
    const active = activeHours(hours);
    expect(active[0].hour).toBe(11);
    expect(active.at(-1)!.hour).toBe(21);
    expect(activeHours(hours.map((h) => ({ ...h, orders: 0 })))).toEqual([]);
  });

  it("acha a faixa de pico de 2 horas", () => {
    expect(peakWindow(hours)).toEqual({ label: "20h às 22h", orders: 11 });
    expect(peakWindow(hours.map((h) => ({ ...h, orders: 0 })))).toBeNull();
  });

  it("escreve tempos e porcentagens", () => {
    expect(formatDuration(7.4)).toBe("7 min");
    expect(formatDuration(75)).toBe("1h15");
    expect(formatDuration(null)).toBe("—");
    expect(percent(1, 3)).toBe(33);
    expect(percent(1, 0)).toBe(0);
  });
});
