import { describe, expect, it } from "vitest";
import { csvCell, fillDays, resolvePeriod, todayBR } from "../finance";

// 24/11/2026 01:30 em UTC = 23/11/2026 22:30 em Brasília
const now = new Date("2026-11-24T01:30:00Z");

describe("resolvePeriod", () => {
  it("usa o dia de Brasília", () => {
    expect(todayBR(now)).toBe("2026-11-23");
    expect(resolvePeriod({}, now)).toEqual({ from: "2026-11-23", to: "2026-11-23", key: "hoje" });
  });
  it("períodos prontos", () => {
    expect(resolvePeriod({ periodo: "7d" }, now)).toMatchObject({ from: "2026-11-17", to: "2026-11-23" });
    expect(resolvePeriod({ periodo: "mes" }, now)).toMatchObject({ from: "2026-11-01", to: "2026-11-23" });
    expect(resolvePeriod({ periodo: "mes-passado" }, now)).toMatchObject({ from: "2026-10-01", to: "2026-10-31" });
    expect(resolvePeriod({ periodo: "ontem" }, now)).toMatchObject({ from: "2026-11-22", to: "2026-11-22" });
  });
  it("datas escolhidas, e recusa intervalo invertido", () => {
    expect(resolvePeriod({ de: "2026-01-01", ate: "2026-01-31" }, now).key).toBe("personalizado");
    expect(resolvePeriod({ de: "2026-02-01", ate: "2026-01-31" }, now).key).toBe("hoje");
  });
});

describe("fillDays", () => {
  it("preenche dias sem venda", () => {
    const days = fillDays([{ day: "2026-11-02", orders: 2, cents: 5000 }], "2026-11-01", "2026-11-03");
    expect(days.map((d) => d.cents)).toEqual([0, 5000, 0]);
  });
});

describe("csvCell", () => {
  it("escapa separador e bloqueia fórmula", () => {
    expect(csvCell('Rua "A"; 10')).toBe('"Rua ""A""; 10"');
    expect(csvCell("=HYPERLINK()")).toBe("'=HYPERLINK()");
    expect(csvCell("-12,50")).toBe("-12,50");
  });
});
