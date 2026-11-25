import { describe, expect, it } from "vitest";
import { daysLeftLabel, endOfDayBR, hasAccess, storeAccess, toDateInputBR, whatsappLink } from "../access";

const base = { is_demo: false, blocked: false, blocked_reason: null, access_until: null as string | null };
const now = new Date("2026-11-25T12:00:00Z");

describe("storeAccess", () => {
  it("demonstração nunca vence", () => {
    expect(storeAccess({ ...base, is_demo: true, blocked: true }, now)).toEqual({ kind: "demo" });
  });
  it("sem prazo", () => {
    expect(storeAccess(base, now).kind).toBe("unlimited");
  });
  it("dentro do prazo conta os dias que faltam", () => {
    const s = storeAccess({ ...base, access_until: "2026-11-28T11:00:00Z" }, now);
    expect(s).toMatchObject({ kind: "active", daysLeft: 3 });
    expect(hasAccess(s)).toBe(true);
  });
  it("vencida", () => {
    const s = storeAccess({ ...base, access_until: "2026-11-25T11:59:59Z" }, now);
    expect(s.kind).toBe("expired");
    expect(hasAccess(s)).toBe(false);
  });
  it("bloqueio vale mais que a validade", () => {
    const s = storeAccess({ ...base, blocked: true, blocked_reason: "Mensalidade", access_until: "2027-01-01T00:00:00Z" }, now);
    expect(s).toEqual({ kind: "blocked", reason: "Mensalidade" });
    expect(hasAccess(s)).toBe(false);
  });
});

describe("datas", () => {
  it("fim do dia em Brasília", () => {
    expect(endOfDayBR("2026-12-31")).toBe("2027-01-01T02:59:59.000Z");
    expect(endOfDayBR("31/12/2026")).toBeNull();
  });
  it("volta para o campo de data no dia de Brasília", () => {
    expect(toDateInputBR("2027-01-01T02:59:59.000Z")).toBe("2026-12-31");
    expect(toDateInputBR(null)).toBe("");
  });
  it("texto dos dias", () => {
    expect(daysLeftLabel(1)).toBe("em menos de 1 dia");
    expect(daysLeftLabel(5)).toBe("em 5 dias");
  });
});

describe("whatsappLink", () => {
  it("aceita com e sem 55", () => {
    expect(whatsappLink("31999990000")).toBe("https://wa.me/5531999990000");
    expect(whatsappLink("5531999990000", "Oi")).toBe("https://wa.me/5531999990000?text=Oi");
    expect(whatsappLink("123")).toBeNull();
    expect(whatsappLink(null)).toBeNull();
  });
});
