import { describe, expect, it } from "vitest";
import { pixWhatsappMessage, storeWhatsappUrl } from "../pix-whatsapp";

const nb = (s: string) => s.replace(/ /g, " ");

const base = {
  number: 42,
  storeName: "Cozinha Mineira da Su",
  customerName: "Bia",
  fulfillment: "delivery" as const,
  address: "Rua das Flores, 10 · Centro",
  scheduled: null,
  items: [
    {
      quantity: 2,
      product_name: "Feijão tropeiro",
      size_name: "Grande",
      flavors: null,
      options: [{ group: "Adicionais", name: "Bacon", price_cents: 300 }],
      notes: "sem cebola",
      total_cents: 7600,
    },
  ],
  subtotalCents: 7600,
  deliveryFeeCents: 500,
  discountCents: 0,
  couponCode: null,
  totalCents: 8100,
  link: "https://exemplo.com/loja/su/pedido/abc",
};

describe("storeWhatsappUrl", () => {
  it("põe o 55 uma vez só", () => {
    expect(storeWhatsappUrl("(31) 99999-8888")).toBe("https://wa.me/5531999998888");
    expect(storeWhatsappUrl("5531999998888")).toBe("https://wa.me/5531999998888");
  });
  it("leva o texto codificado", () => {
    expect(storeWhatsappUrl("31999998888", "Olá & tchau")).toBe("https://wa.me/5531999998888?text=Ol%C3%A1%20%26%20tchau");
  });
});

describe("pixWhatsappMessage", () => {
  it("tem número, itens, total, entrega, nome e pede a chave Pix", () => {
    const m = nb(pixWhatsappMessage(base));
    expect(m).toContain("pedido *#42*");
    expect(m).toContain("chave Pix");
    expect(m).toContain("2x Feijão tropeiro (Grande) - R$ 76,00");
    expect(m).toContain("+ Bacon");
    expect(m).toContain("Obs.: sem cebola");
    expect(m).toContain("Entrega: R$ 5,00");
    expect(m).toContain("*Total: R$ 81,00*");
    expect(m).toContain("*Nome:* Bia");
    expect(m).toContain("*Entrega em:* Rua das Flores, 10 · Centro");
    expect(m).toContain("Acompanhar o pedido: https://exemplo.com/loja/su/pedido/abc");
  });
  it("retirada com cupom e agendamento", () => {
    const m = nb(
      pixWhatsappMessage({ ...base, fulfillment: "pickup", discountCents: 1000, couponCode: "SU10", scheduled: "Amanhã às 12:00", link: null }),
    );
    expect(m).toContain("*Retirada na loja*");
    expect(m).not.toContain("Entrega:");
    expect(m).toContain("Cupom SU10: - R$ 10,00");
    expect(m).toContain("*Agendado para:* Amanhã às 12:00");
    expect(m).not.toContain("Acompanhar");
  });
});
