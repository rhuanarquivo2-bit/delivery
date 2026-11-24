import { promoPrice } from "./promotions";
import type { Category, CouponKind, HalfPriceRule, MenuOption, PaymentMethod, Product } from "./types";

/**
 * Mesma regra do place_order no banco. Aqui é só para mostrar o valor ao cliente;
 * o banco recalcula tudo na hora de gravar o pedido.
 */
export function flavorsPrice(prices: number[], rule: HalfPriceRule) {
  if (prices.length === 0) return 0;
  if (rule === "average") return Math.ceil(prices.reduce((a, b) => a + b, 0) / prices.length);
  return Math.max(...prices);
}

export function priceForSize(product: Product, sizeId: string) {
  return product.prices.find((p) => p.size_id === sizeId)?.price_cents ?? null;
}

export type CartSelection = {
  productId: string;
  sizeId: string | null;
  /** Outros sabores (além do produto principal). */
  flavorIds: string[];
  optionIds: string[];
  quantity: number;
  notes: string;
};

/** Preço do produto já com a melhor promoção do momento (quando `withPromos`). */
function productPrice(product: Product, price: number | null, withPromos: boolean) {
  if (price === null) return null;
  return withPromos ? promoPrice(price, product.promos).price : price;
}

/**
 * Preço de uma unidade com adicionais. Por padrão já aplica as promoções
 * (cada sabor com a sua); `withPromos: false` dá o preço cheio para mostrar riscado.
 */
export function unitPrice(
  category: Category,
  selection: CartSelection,
  { withPromos = true }: { withPromos?: boolean } = {},
): number | null {
  const product = category.products.find((p) => p.id === selection.productId);
  if (!product) return null;

  let base: number | null;
  if (category.has_sizes) {
    if (!selection.sizeId) return null;
    const flavors = [product, ...selection.flavorIds.map((id) => category.products.find((p) => p.id === id))];
    const prices = flavors.map((p) => (p ? productPrice(p, priceForSize(p, selection.sizeId!), withPromos) : null));
    if (prices.some((p) => p === null)) return null;
    base = flavorsPrice(prices as number[], category.half_price_rule);
  } else {
    base = productPrice(product, product.price_cents, withPromos);
  }
  if (base === null) return null;

  const options = category.groups.flatMap((g) => g.options);
  const extras = selection.optionIds
    .map((id) => options.find((o) => o.id === id))
    .filter((o): o is MenuOption => Boolean(o))
    .reduce((sum, o) => sum + o.price_cents, 0);
  return base + extras;
}

/** Menor preço de um produto (para mostrar "a partir de" no cardápio). */
export function startingPrice(category: Category, product: Product, { withPromos = true } = {}) {
  if (!category.has_sizes) return productPrice(product, product.price_cents, withPromos);
  const prices = product.prices.map((p) => productPrice(product, p.price_cents, withPromos)!);
  return prices.length ? Math.min(...prices) : null;
}

/** Nome da promoção que está baixando o preço do produto agora (para o selo no cardápio). */
export function activePromoName(category: Category, product: Product) {
  const full = startingPrice(category, product, { withPromos: false });
  if (full === null) return null;
  return promoPrice(full, product.promos).name;
}

/** Problemas na escolha de adicionais, por grupo. */
export function optionErrors(category: Category, optionIds: string[]) {
  const errors: Record<string, string> = {};
  for (const g of category.groups) {
    const count = g.options.filter((o) => optionIds.includes(o.id)).length;
    if (count < g.min_select) {
      errors[g.id] = g.min_select === 1 ? "Escolha 1 opção." : `Escolha pelo menos ${g.min_select}.`;
    } else if (count > g.max_select) {
      errors[g.id] = `Escolha no máximo ${g.max_select}.`;
    }
  }
  return errors;
}

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  pix_online: "Pix online",
  pix_delivery: "Pix na entrega",
  card_delivery: "Cartão na entrega",
  cash: "Dinheiro",
};

/** Troco a devolver (null quando não precisa). */
export function changeDue(totalCents: number, changeForCents: number | null) {
  if (changeForCents === null || changeForCents <= totalCents) return null;
  return changeForCents - totalCents;
}

export type AppliedCoupon = {
  code: string;
  kind: CouponKind;
  value: number;
  min_order_cents: number;
  max_discount_cents: number | null;
  description: string | null;
};

/** Desconto do cupom (mesma conta do price_order). null = pedido abaixo do mínimo do cupom. */
export function couponDiscount(coupon: AppliedCoupon, subtotal: number, fee: number) {
  if (subtotal < coupon.min_order_cents) return null;
  if (coupon.kind === "percent") {
    return Math.min(Math.floor((subtotal * coupon.value) / 100), coupon.max_discount_cents ?? subtotal);
  }
  if (coupon.kind === "fixed") return Math.min(coupon.value, subtotal);
  return fee;
}

export function couponLabel(coupon: Pick<AppliedCoupon, "kind" | "value">, formatMoney: (cents: number) => string) {
  if (coupon.kind === "percent") return `${coupon.value}% de desconto`;
  if (coupon.kind === "fixed") return `${formatMoney(coupon.value)} de desconto`;
  return "Entrega grátis";
}

/** Desconto em % para o selo do cartão (-20%). Null quando não há desconto que valha mostrar. */
export function discountPercent(full: number | null, from: number | null) {
  if (full === null || from === null || full <= 0 || from >= full) return null;
  const pct = Math.round(((full - from) / full) * 100);
  return pct >= 1 ? pct : null;
}
