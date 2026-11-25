import { describe, expect, it } from "vitest";
import { fixedIcon, manifestIcons, storeIconUrl } from "./app-icon";
import { courierMessage, itemsLine, newOrderMessage, statusMessage } from "./messages";

/** formatBRL usa espaço fixo entre "R$" e o valor. */
const nb = (s: string | undefined) => (s ?? "").replace(/\u00a0/g, " ");

const cash = { payment_method: "cash" as const, payment_status: "on_delivery" as const, change_for_cents: 5000 };

describe("mensagens das notificações", () => {
  it("pedido novo para o painel, com cliente, bairro, itens e pagamento", () => {
    const m = newOrderMessage({
      number: 42,
      customer_name: "Ana",
      total_cents: 4892,
      fulfillment: "delivery",
      address_district: "Centro",
      ...cash,
      items: [
        { product_name: "X-Burger", quantity: 2 },
        { product_name: "Coca-Cola", size_name: "2L", quantity: 1 },
      ],
    });
    expect(nb(m.title)).toBe("🔔 Novo pedido #42 · R$ 48,92");
    expect(nb(m.body)).toBe("👤 Ana · 🛵 Entrega · Centro\n🧾 2x X-Burger, 1x Coca-Cola (2L)\n💵 Dinheiro · troco para R$ 50,00");
    expect(m.url).toBe("/painel/pedidos");
    expect(m.requireInteraction).toBe(true);
    expect(m.actions?.[0].title).toBe("Ver pedido");
  });

  it("Pix pago, retirada e agendado", () => {
    const pix = { payment_method: "pix_online" as const, payment_status: "paid" as const, change_for_cents: null };
    const paid = newOrderMessage({ number: 7, customer_name: "Bia", total_cents: 1000, fulfillment: "pickup", ...pix, pixPaid: true });
    expect(nb(paid.title)).toBe("💰 Pix pago! Pedido #7 · R$ 10,00");
    expect(nb(paid.body)).toContain("🛍️ Retirada no balcão");
    expect(nb(paid.body)).toContain("✅ Pago online pelo Pix");
    const later = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString();
    const sched = newOrderMessage({ number: 8, customer_name: "Bia", total_cents: 1000, fulfillment: "pickup", ...cash, change_for_cents: null, scheduled_for: later });
    expect(nb(sched.title)).toBe("📅 Pedido agendado #8 · R$ 10,00");
    expect(nb(sched.body)).toMatch(/🕒 Para .+ às \d\d:\d\d/);
  });

  it("resume muitos itens", () => {
    const items = [1, 2, 3, 4, 5].map((n) => ({ product_name: `P${n}`, quantity: 1 }));
    expect(itemsLine(items)).toBe("1x P1, 1x P2, 1x P3 +2 itens");
  });

  it("entrega para o motoboy com endereço, cobrança e mapa", () => {
    const m = courierMessage({
      number: 9,
      storeName: "Pizzaria",
      customerName: "Paulo",
      street: "Rua A",
      streetNumber: "10",
      district: "Centro",
      reference: "Portão azul",
      total_cents: 4892,
      ...cash,
      token: "abc",
    });
    expect(nb(m.title)).toBe("🛵 Nova entrega #9 · Pizzaria");
    expect(nb(m.body)).toBe("📍 Rua A, 10 · Centro\n🔎 Portão azul\n👤 Paulo\n💰 Cobrar R$ 48,92 em dinheiro · Levar R$ 1,08 de troco (cliente paga com R$ 50,00).");
    expect(m.url).toBe("/entregador/abc");
    expect(m.actions?.map((a) => a.title)).toEqual(["Ver entrega", "🗺️ Abrir mapa"]);
    expect(m.actions?.[1].url).toContain("google.com/maps");
  });

  it("status para o cliente", () => {
    const base = { number: 5, fulfillment: "delivery" as const, storeName: "Loja X", slug: "loja", token: "12345678-aaaa", total_cents: 4892, ...cash };
    const prep = statusMessage({ ...base, status: "preparing" });
    expect(nb(prep?.title)).toBe("👨‍🍳 Pedido #5 em preparo");
    expect(nb(prep?.body)).toContain("A Loja X aceitou seu pedido");
    expect(prep?.url).toBe("/loja/loja/pedido/12345678-aaaa");
    const out = statusMessage({ ...base, status: "out_for_delivery" });
    expect(nb(out?.title)).toBe("🛵 Pedido #5 saiu para entrega!");
    expect(nb(out?.body)).toContain("O troco para R$ 50,00 já vai junto");
    const done = statusMessage({ ...base, status: "delivered", pointsEarned: 48 });
    expect(nb(done?.title)).toBe("😋 Pedido #5 entregue. Bom apetite!");
    expect(nb(done?.body)).toContain("🎁 Você ganhou 48 pontos");
    expect(done?.actions?.[0]).toMatchObject({ title: "Pedir de novo", url: "/loja/loja" });
    const cancel = statusMessage({ ...base, status: "cancelled", cancel_reason: "Sem entregador" });
    expect(nb(cancel?.title)).toBe("❌ Pedido #5 cancelado");
    expect(nb(cancel?.body)).toContain("Motivo: Sem entregador");
    expect(statusMessage({ ...base, status: "pending" })).toBeNull();
    // Entrega: "pronto" não interessa; retirada: interessa.
    expect(statusMessage({ ...base, status: "ready" })).toBeNull();
    expect(statusMessage({ ...base, fulfillment: "pickup", status: "ready" })?.title).toBe("🛍️ Pedido #5 pronto para retirar!");
    // pedido agendado: "confirmado"
    expect(statusMessage({ ...base, status: "preparing", scheduled_for: new Date().toISOString() })?.title).toBe("✅ Pedido #5 confirmado!");
  });
});

describe("ícone do app", () => {
  it("painel, entregador e loja", () => {
    expect(manifestIcons((s) => fixedIcon("painel", s))).toHaveLength(4);
    expect(fixedIcon("entregador", 512)).toBe("/icons/entregador-512.png");
    // a versão muda quando o logo muda (o celular busca o ícone novo)
    expect(storeIconUrl("loja", 192, null)).toBe("/api/icone/loja/loja/192.png?v=0");
    expect(storeIconUrl("loja", 192, "a.png")).not.toBe(storeIconUrl("loja", 192, "b.png"));
  });
});
