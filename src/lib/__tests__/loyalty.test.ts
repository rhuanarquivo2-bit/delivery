import { describe, expect, it } from "vitest";
import { nextReward, pointsFor, pointsRule, rewardDiscount, type LoyaltyReward } from "../loyalty";

const pct = (percent: number, cost = 80): LoyaltyReward => ({ id: "p", name: "%", points_cost: cost, kind: "percent", percent, product_id: null });
const prod = (cost: number): LoyaltyReward => ({ id: `x${cost}`, name: "Brinde", points_cost: cost, kind: "product", percent: null, product_id: "b" });

describe("fidelidade", () => {
  it("conta os pontos como o banco", () => {
    expect(pointsFor(6000, 1200, 100)).toBe(48);
    expect(pointsFor(5999, 0, 100)).toBe(59);
    expect(pointsFor(1000, 2000, 100)).toBe(0);
    expect(pointsFor(5000, 0, 500)).toBe(10);
  });
  it("desconto da recompensa em %", () => {
    expect(rewardDiscount(pct(20), 6000, 0)).toBe(1200);
    expect(rewardDiscount(pct(20), 6000, 1000)).toBe(1000);
    expect(rewardDiscount(pct(100), 6000, 1000)).toBe(5000);
    expect(rewardDiscount(prod(50), 6000, 0)).toBe(0);
    expect(rewardDiscount(null, 6000, 0)).toBe(0);
  });
  it("próxima recompensa", () => {
    expect(nextReward([prod(100), prod(50)], 60)?.points_cost).toBe(100);
    expect(nextReward([prod(50)], 60)).toBeNull();
  });
  it("texto da regra", () => {
    expect(pointsRule(100)).toMatch(/R\$\s?1,00 em compras você ganha 1 ponto/);
  });
});
