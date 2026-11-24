import { describe, expect, it } from "vitest";
import { collectInstruction, describeFee, mapsUrl, settlement } from "../couriers";

const nb = (s: string) => s.replace(/ /g, " ");

describe("collectInstruction", () => {
  it("pago online: não cobrar", () => {
    expect(collectInstruction({ payment_method: "pix_online", payment_status: "paid", total_cents: 5000, change_for_cents: null }).title).toBe("Já pago");
  });
  it("dinheiro com troco", () => {
    const r = collectInstruction({ payment_method: "cash", payment_status: "on_delivery", total_cents: 3800, change_for_cents: 5000 });
    expect(nb(r.title)).toBe("Cobrar R$ 38,00 em dinheiro");
    expect(nb(r.detail)).toBe("Levar R$ 12,00 de troco (cliente paga com R$ 50,00).");
  });
  it("cartão", () => {
    const r = collectInstruction({ payment_method: "card_delivery", payment_status: "on_delivery", total_cents: 2000, change_for_cents: null });
    expect(r.detail).toContain("maquininha");
  });
});

describe("settlement", () => {
  it("motoboy devolve a diferença do dinheiro", () => {
    expect(nb(settlement({ cash_cents: 10000, earned_cents: 4400 }).text)).toBe("Motoboy devolve R$ 56,00 para a loja");
  });
  it("loja paga quando o dinheiro não cobre", () => {
    expect(nb(settlement({ cash_cents: 0, earned_cents: 4400 }).text)).toBe("Loja paga R$ 44,00 ao motoboy");
  });
});

describe("helpers", () => {
  it("descreve a taxa", () => {
    expect(nb(describeFee("fixed", 700, 3000))).toBe("R$ 7,00 por entrega + diária de R$ 30,00");
    expect(describeFee("zone_fee", 0, 0)).toBe("taxa do bairro por entrega");
  });
  it("monta o link do mapa", () => {
    expect(mapsUrl({ address_street: "Rua A", address_number: "10", address_district: "Centro" }, "Campinas")).toContain(
      encodeURIComponent("Rua A, 10 - Centro - Campinas"),
    );
  });
});
