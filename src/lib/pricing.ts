import type { Category, HalfPriceRule, MenuOption, PaymentMethod, Product } from "./types";

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

export function unitPrice(category: Category, selection: CartSelection): number | null {
  const product = category.products.find((p) => p.id === selection.productId);
  if (!product) return null;

  let base: number | null;
  if (category.has_sizes) {
    if (!selection.sizeId) return null;
    const flavors = [product, ...selection.flavorIds.map((id) => category.products.find((p) => p.id === id))];
    const prices = flavors.map((p) => (p ? priceForSize(p, selection.sizeId!) : null));
    if (prices.some((p) => p === null)) return null;
    base = flavorsPrice(prices as number[], category.half_price_rule);
  } else {
    base = product.price_cents;
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
export function startingPrice(category: Category, product: Product) {
  if (!category.has_sizes) return product.price_cents;
  const prices = product.prices.map((p) => p.price_cents);
  return prices.length ? Math.min(...prices) : null;
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
