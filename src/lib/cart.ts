"use client";

import { useSyncExternalStore } from "react";
import type { CartSelection } from "./pricing";

export type CartLine = {
  key: string;
  categoryId: string;
  selection: CartSelection;
  /** Texto para mostrar no carrinho (nome, tamanho, sabores, adicionais). */
  title: string;
  details: string[];
  unitPriceCents: number;
};

const EMPTY: CartLine[] = [];
const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | null; lines: CartLine[] }>();

const storageKey = (slug: string) => `carrinho:${slug}`;

function read(slug: string): CartLine[] {
  if (typeof window === "undefined") return EMPTY;
  const raw = window.localStorage.getItem(storageKey(slug));
  const cached = cache.get(slug);
  if (cached && cached.raw === raw) return cached.lines;
  let lines: CartLine[] = EMPTY;
  try {
    lines = raw ? (JSON.parse(raw) as CartLine[]) : EMPTY;
  } catch {
    lines = EMPTY;
  }
  cache.set(slug, { raw, lines });
  return lines;
}

function write(slug: string, lines: CartLine[]) {
  if (lines.length) window.localStorage.setItem(storageKey(slug), JSON.stringify(lines));
  else window.localStorage.removeItem(storageKey(slug));
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = () => listener();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useCart(slug: string) {
  const lines = useSyncExternalStore(
    subscribe,
    () => read(slug),
    () => EMPTY,
  );

  return {
    lines,
    count: lines.reduce((n, l) => n + l.selection.quantity, 0),
    subtotal: lines.reduce((n, l) => n + l.unitPriceCents * l.selection.quantity, 0),
    add(line: Omit<CartLine, "key">) {
      write(slug, [...read(slug), { ...line, key: crypto.randomUUID() }]);
    },
    setQuantity(key: string, quantity: number) {
      const next = read(slug)
        .map((l) => (l.key === key ? { ...l, selection: { ...l.selection, quantity } } : l))
        .filter((l) => l.selection.quantity > 0);
      write(slug, next);
    },
    replace(next: CartLine[]) {
      write(slug, next);
    },
    clear() {
      write(slug, []);
    },
  };
}
