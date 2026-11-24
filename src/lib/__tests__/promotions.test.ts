import { describe, expect, it } from "vitest";
import { couponDiscount, unitPrice, type AppliedCoupon } from "../pricing";
import { describeSchedule, isPromotionLive, promoPrice } from "../promotions";
import type { Category, Promotion } from "../types";

const base: Promotion = {
  id: "p",
  store_id: "s",
  name: "Promo",
  kind: "percent",
  value: 20,
  product_id: "x",
  category_id: null,
  weekdays: null,
  starts_on: null,
  ends_on: null,
  start_time: null,
  end_time: null,
  active: true,
  created_at: "",
};

// 2026-11-24 é terça; 15:00 UTC = 12:00 em Brasília
const tuesdayNoon = new Date("2026-11-24T15:00:00Z");

describe("isPromotionLive", () => {
  it("vale sempre quando não há regras", () => {
    expect(isPromotionLive(base, tuesdayNoon)).toBe(true);
  });
  it("respeita pausa, dias da semana e período", () => {
    expect(isPromotionLive({ ...base, active: false }, tuesdayNoon)).toBe(false);
    expect(isPromotionLive({ ...base, weekdays: [2] }, tuesdayNoon)).toBe(true);
    expect(isPromotionLive({ ...base, weekdays: [3, 4] }, tuesdayNoon)).toBe(false);
    expect(isPromotionLive({ ...base, ends_on: "2026-11-23" }, tuesdayNoon)).toBe(false);
    expect(isPromotionLive({ ...base, starts_on: "2026-11-24", ends_on: "2026-11-24" }, tuesdayNoon)).toBe(true);
  });
  it("usa o horário de Brasília, inclusive passando da meia-noite", () => {
    expect(isPromotionLive({ ...base, start_time: "11:00:00", end_time: "14:00:00" }, tuesdayNoon)).toBe(true);
    expect(isPromotionLive({ ...base, start_time: "18:00:00", end_time: "20:00:00" }, tuesdayNoon)).toBe(false);
    const lateNight = new Date("2026-11-25T03:30:00Z"); // 00:30 em Brasília
    expect(isPromotionLive({ ...base, start_time: "22:00:00", end_time: "02:00:00" }, lateNight)).toBe(true);
  });
});

describe("promoPrice", () => {
  it("escolhe a promoção que deixa mais barato", () => {
    const promos = [
      { name: "10%", kind: "percent" as const, value: 10 },
      { name: "R$ 8", kind: "fixed" as const, value: 800 },
    ];
    expect(promoPrice(5000, promos)).toEqual({ price: 4200, name: "R$ 8" });
    expect(promoPrice(10000, promos)).toEqual({ price: 9000, name: "10%" });
    expect(promoPrice(500, [{ name: "R$ 8", kind: "fixed", value: 800 }])).toEqual({ price: 0, name: "R$ 8" });
    expect(promoPrice(5000, [])).toEqual({ price: 5000, name: null });
  });
});

describe("unitPrice com promoção", () => {
  const pizzas: Category = {
    id: "c",
    store_id: "s",
    name: "Pizzas",
    description: null,
    has_sizes: true,
    half_price_rule: "highest",
    active: true,
    sort_order: 0,
    sizes: [{ id: "g", category_id: "c", name: "Grande", max_flavors: 2, sort_order: 0 }],
    groups: [],
    products: [
      {
        id: "mussa",
        category_id: "c",
        name: "Mussarela",
        description: null,
        image_url: null,
        price_cents: null,
        active: true,
        sort_order: 0,
        prices: [{ product_id: "mussa", size_id: "g", price_cents: 5000 }],
        promos: [{ name: "Mussa", kind: "fixed", value: 1000 }],
      },
      {
        id: "calab",
        category_id: "c",
        name: "Calabresa",
        description: null,
        image_url: null,
        price_cents: null,
        active: true,
        sort_order: 1,
        prices: [{ product_id: "calab", size_id: "g", price_cents: 4800 }],
        promos: [],
      },
    ],
  };
  const sel = { productId: "mussa", sizeId: "g", flavorIds: [] as string[], optionIds: [], quantity: 1, notes: "" };

  it("aplica a promoção em cada sabor antes da regra do meio a meio", () => {
    expect(unitPrice(pizzas, sel)).toBe(4000);
    expect(unitPrice(pizzas, sel, { withPromos: false })).toBe(5000);
    // mussarela 4000 (promo) + calabresa 4800 -> mais caro = 4800 (mesma conta do banco)
    expect(unitPrice(pizzas, { ...sel, flavorIds: ["calab"] })).toBe(4800);
  });
});

describe("couponDiscount", () => {
  const coupon: AppliedCoupon = {
    code: "X",
    kind: "percent",
    value: 10,
    min_order_cents: 3000,
    max_discount_cents: 1500,
    description: null,
  };
  it("calcula porcentagem com teto e mínimo", () => {
    expect(couponDiscount(coupon, 4000, 700)).toBe(400);
    expect(couponDiscount(coupon, 40000, 700)).toBe(1500);
    expect(couponDiscount(coupon, 2000, 700)).toBeNull();
  });
  it("valor fixo nunca passa do subtotal e frete grátis zera a taxa", () => {
    expect(couponDiscount({ ...coupon, kind: "fixed", value: 5000, min_order_cents: 0 }, 3000, 700)).toBe(3000);
    expect(couponDiscount({ ...coupon, kind: "free_delivery", value: 0, min_order_cents: 0 }, 3000, 700)).toBe(700);
  });
});

describe("describeSchedule", () => {
  it("resume os dias e horários", () => {
    expect(describeSchedule({ ...base, weekdays: [4, 2], start_time: "18:00:00", end_time: "20:00:00", ends_on: "2026-11-30" })).toBe(
      "Ter, Qui · 18:00 às 20:00 · até 30/11",
    );
    expect(describeSchedule(base)).toBe("Todos os dias");
  });
});
