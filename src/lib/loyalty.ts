import { formatBRL } from "./utils";

export type LoyaltyReward = {
  id: string;
  name: string;
  points_cost: number;
  kind: "product" | "percent";
  percent: number | null;
  product_id: string | null;
};

export type LoyaltyPoints = { balance: number; expiring_points: number; expiring_at: string | null };

export type LoyaltyStatus =
  | { enabled: false }
  | {
      enabled: true;
      cents_per_point: number;
      welcome_points: number;
      expiry_days: number;
      rewards: LoyaltyReward[];
      verified: boolean;
      phone_end: string | null;
      points: LoyaltyPoints | null;
    };

/** "A cada R$ 1,00 em compras você ganha 1 ponto". */
export function pointsRule(centsPerPoint: number) {
  return `A cada ${formatBRL(centsPerPoint)} em compras você ganha 1 ponto`;
}

/** Pontos que um pedido gera (mesma conta do banco). */
export function pointsFor(subtotalCents: number, discountCents: number, centsPerPoint: number) {
  return Math.floor(Math.max(subtotalCents - discountCents, 0) / centsPerPoint);
}

/** Desconto da recompensa de % (mesma conta do banco: sobre subtotal - cupom). */
export function rewardDiscount(reward: LoyaltyReward | null, subtotalCents: number, couponDiscountCents: number) {
  if (!reward || reward.kind !== "percent" || !reward.percent) return 0;
  const base = Math.max(subtotalCents - couponDiscountCents, 0);
  return Math.min(Math.max(Math.round((base * reward.percent) / 100), 0), base);
}

/** Próxima recompensa que o cliente ainda não alcançou. */
export function nextReward(rewards: LoyaltyReward[], balance: number) {
  return [...rewards].sort((a, b) => a.points_cost - b.points_cost).find((r) => r.points_cost > balance) ?? null;
}
