import { describe, expect, it } from "vitest";
import { daysSince, matchesFilter, searchCustomers, summarizeCustomers, whatsappLink, type CustomerRow } from "../customers";

const now = new Date("2026-11-27T15:00:00Z");
const c = (over: Partial<CustomerRow>): CustomerRow => ({
  phone: "11988887777",
  name: "Maria",
  orders: 1,
  cancelled: 0,
  total_cents: 5000,
  first_order_at: "2026-11-20T20:00:00Z",
  last_order_at: "2026-11-20T20:00:00Z",
  district: "Centro",
  ...over,
});

describe("clientes", () => {
  const rows = [
    c({}),
    c({ phone: "11911112222", name: "João Pedro", orders: 4, total_cents: 20000, first_order_at: "2026-08-01T20:00:00Z", last_order_at: "2026-11-25T20:00:00Z", district: "Vila Nova" }),
    c({ phone: "11933334444", name: "Ana", orders: 2, total_cents: 9000, first_order_at: "2026-07-01T20:00:00Z", last_order_at: "2026-09-01T20:00:00Z" }),
    c({ phone: "11955556666", name: "Só cancelou", orders: 0, cancelled: 1, total_cents: 0 }),
  ];

  it("separa fiéis, novos e sumidos", () => {
    expect(rows.filter((r) => matchesFilter(r, "fieis", now)).map((r) => r.name)).toEqual(["João Pedro"]);
    expect(rows.filter((r) => matchesFilter(r, "novos", now)).map((r) => r.name)).toEqual(["Maria"]);
    expect(rows.filter((r) => matchesFilter(r, "sumidos", now)).map((r) => r.name)).toEqual(["Ana"]);
    expect(rows.filter((r) => matchesFilter(r, "todos", now))).toHaveLength(4);
  });

  it("resume a base (quem só cancelou não conta)", () => {
    expect(summarizeCustomers(rows, now)).toEqual({
      customers: 3,
      returning: 2,
      loyal: 1,
      newOnes: 1,
      away: 1,
      avgSpentCents: Math.round(34000 / 3),
    });
  });

  it("busca por nome sem acento, telefone ou bairro", () => {
    expect(searchCustomers(rows, "joao").map((r) => r.name)).toEqual(["João Pedro"]);
    expect(searchCustomers(rows, "3333").map((r) => r.name)).toEqual(["Ana"]);
    expect(searchCustomers(rows, "vila").map((r) => r.name)).toEqual(["João Pedro"]);
    expect(searchCustomers(rows, " ")).toHaveLength(4);
  });

  it("conta dias de calendário no horário de Brasília", () => {
    expect(daysSince("2026-11-27T13:00:00Z", now)).toBe(0);
    // 26/11 às 23h em Brasília = 27/11 02h UTC: foi ontem
    expect(daysSince("2026-11-27T02:00:00Z", now)).toBe(1);
  });

  it("monta o link do WhatsApp", () => {
    expect(whatsappLink("11988887777")).toBe("https://wa.me/5511988887777");
    expect(whatsappLink("5511988887777", "Oi!")).toBe("https://wa.me/5511988887777?text=Oi!");
  });
});
