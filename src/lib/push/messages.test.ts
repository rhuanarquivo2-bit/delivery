import { describe, expect, it } from "vitest";
import { appIconUrl, manifestIcons } from "./app-icon";
import { courierMessage, newOrderMessage, statusMessage } from "./messages";

describe("mensagens das notificações", () => {
  it("pedido novo para o painel", () => {
    const m = newOrderMessage({ number: 42, customer_name: "Ana", total_cents: 5990, fulfillment: "delivery" });
    expect(m.title).toBe("Novo pedido #42");
    expect(m.body).toContain("Ana");
    expect(m.body).toContain("59,90");
    expect(m.body).toContain("Entrega");
    expect(m.url).toBe("/painel/pedidos");
  });

  it("pedido agendado e Pix pago", () => {
    expect(newOrderMessage({ number: 7, customer_name: "Bia", total_cents: 100, fulfillment: "pickup", scheduled: true }).title).toBe(
      "Novo pedido #7 (agendado)",
    );
    expect(newOrderMessage({ number: 7, customer_name: "Bia", total_cents: 100, fulfillment: "pickup", pixPaid: true }).title).toBe(
      "Pix pago · pedido #7",
    );
  });

  it("entrega para o motoboy com endereço", () => {
    const m = courierMessage({
      number: 9,
      storeName: "Pizzaria",
      street: "Rua A",
      streetNumber: "10",
      district: "Centro",
      token: "abc",
    });
    expect(m.title).toBe("Nova entrega #9 · Pizzaria");
    expect(m.body).toBe("Rua A, 10 · Centro");
    expect(m.url).toBe("/entregador/abc");
  });

  it("status para o cliente", () => {
    const base = { number: 5, fulfillment: "delivery" as const, storeName: "Loja", slug: "loja", token: "12345678-aaaa" };
    expect(statusMessage({ ...base, status: "preparing" })?.body).toContain("aceitou");
    expect(statusMessage({ ...base, status: "out_for_delivery" })?.body).toContain("saiu para entrega");
    expect(statusMessage({ ...base, status: "delivered" })?.body).toContain("entregue");
    expect(statusMessage({ ...base, status: "cancelled" })?.body).toContain("cancelado");
    expect(statusMessage({ ...base, status: "pending" })).toBeNull();
    // Entrega: "pronto" não interessa; retirada: interessa.
    expect(statusMessage({ ...base, status: "ready" })).toBeNull();
    expect(statusMessage({ ...base, fulfillment: "pickup", status: "ready" })?.body).toContain("pronto para retirada");
    expect(statusMessage({ ...base, status: "preparing" })?.url).toBe("/loja/loja/pedido/12345678-aaaa");
  });
});

describe("ícone do app", () => {
  it("usa a inicial e a cor da loja", () => {
    expect(appIconUrl(192, "pizzaria", "#123ABC")).toBe("/api/icone/192?l=P&c=123ABC");
    expect(appIconUrl(180, "", "vermelho")).toBe("/api/icone/180?l=F&c=e4572e");
    expect(manifestIcons("A")).toHaveLength(4);
  });
});
