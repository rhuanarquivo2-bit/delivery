import { beforeEach, describe, expect, it } from "vitest";
import { isActiveOrder, loadOrderTokens, pinProblem, rememberOrders, splitOrders, type OrderSummary } from "../my-orders";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    },
  };
});

const t = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const order = (n: number, status: OrderSummary["status"], day: number, payment: OrderSummary["payment_status"] = "on_delivery"): OrderSummary => ({
  token: t(n),
  number: n,
  status,
  fulfillment: "delivery",
  payment_status: payment,
  total_cents: 1000,
  created_at: `2026-11-${String(day).padStart(2, "0")}T12:00:00Z`,
  scheduled_for: null,
  items: [],
});

describe("pedidos guardados no aparelho", () => {
  it("guarda sem repetir e com o mais novo primeiro", () => {
    rememberOrders("loja", [t(1)]);
    rememberOrders("loja", [t(2)]);
    rememberOrders("loja", [t(1)]);
    expect(loadOrderTokens("loja")).toEqual([t(1), t(2)]);
    expect(loadOrderTokens("outra")).toEqual([]);
  });
  it("ignora lixo salvo", () => {
    store.set("pedidos:loja", JSON.stringify(["x", 3, t(5)]));
    expect(loadOrderTokens("loja")).toEqual([t(5)]);
    store.set("pedidos:loja", "{quebrado");
    expect(loadOrderTokens("loja")).toEqual([]);
  });
  it("guarda no máximo 50", () => {
    rememberOrders("loja", Array.from({ length: 60 }, (_, i) => t(i + 1)));
    expect(loadOrderTokens("loja")).toHaveLength(50);
  });
});

describe("lista de pedidos", () => {
  it("separa em andamento e anteriores", () => {
    const { active, past } = splitOrders([order(1, "delivered", 1), order(3, "preparing", 3), order(2, "cancelled", 2), order(4, "pending", 4, "expired")]);
    expect(active.map((o) => o.number)).toEqual([3]);
    expect(past.map((o) => o.number)).toEqual([4, 2, 1]);
    expect(isActiveOrder(order(5, "out_for_delivery", 5))).toBe(true);
  });
});

describe("senha", () => {
  it("aceita 4 números não óbvios", () => {
    expect(pinProblem("2580")).toBeNull();
    expect(pinProblem("12")).toMatch(/4 números/);
    expect(pinProblem("abcd")).toMatch(/4 números/);
    expect(pinProblem("7777")).toMatch(/fácil/);
    expect(pinProblem("1234")).toMatch(/fácil/);
  });
});
