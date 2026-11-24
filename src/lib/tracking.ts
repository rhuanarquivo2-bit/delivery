/**
 * Eventos de marketing da loja (Facebook Pixel e Google Analytics).
 * Só dispara se a loja configurou o código; sem configuração não faz nada.
 */
type Fbq = (...args: unknown[]) => void;
type Gtag = (...args: unknown[]) => void;

declare global {
  interface Window {
    fbq?: Fbq;
    gtag?: Gtag;
  }
}

export const PIXEL_ID_PATTERN = /^[0-9]{6,20}$/;
export const GA_ID_PATTERN = /^G-[A-Z0-9]{4,16}$/;

type Item = { id: string; name: string; price_cents: number; quantity: number };

function money(cents: number) {
  return Math.round(cents) / 100;
}

export function trackAddToCart(item: Item) {
  if (typeof window === "undefined") return;
  window.fbq?.("track", "AddToCart", {
    content_ids: [item.id],
    content_name: item.name,
    content_type: "product",
    value: money(item.price_cents * item.quantity),
    currency: "BRL",
  });
  window.gtag?.("event", "add_to_cart", {
    currency: "BRL",
    value: money(item.price_cents * item.quantity),
    items: [{ item_id: item.id, item_name: item.name, price: money(item.price_cents), quantity: item.quantity }],
  });
}

export function trackBeginCheckout(totalCents: number, count: number) {
  if (typeof window === "undefined") return;
  window.fbq?.("track", "InitiateCheckout", { value: money(totalCents), currency: "BRL", num_items: count });
  window.gtag?.("event", "begin_checkout", { currency: "BRL", value: money(totalCents) });
}

export function trackPurchase(orderId: string, totalCents: number) {
  if (typeof window === "undefined") return;
  window.fbq?.("track", "Purchase", { value: money(totalCents), currency: "BRL" }, { eventID: orderId });
  window.gtag?.("event", "purchase", { transaction_id: orderId, currency: "BRL", value: money(totalCents) });
}
