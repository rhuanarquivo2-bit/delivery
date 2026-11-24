"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { Plus, Sparkles } from "lucide-react";
import { cartSuggestions, type CartSuggestion } from "@/app/loja/[slug]/actions";
import type { CartLine } from "@/lib/cart";
import { startingPrice } from "@/lib/pricing";
import type { Category, Product } from "@/lib/types";
import { formatBRL } from "@/lib/utils";
import { ProductDialog } from "./product-dialog";

type Item = { suggestion: CartSuggestion; category: Category; product: Product; label: string };

/** Checkout: "Que tal adicionar?" com até 3 produtos sugeridos. */
export function CartSuggestions({
  storeId,
  menu,
  cartProductIds,
  canOrder,
  onAdd,
}: {
  storeId: string;
  menu: Category[];
  cartProductIds: string[];
  canOrder: boolean;
  onAdd: (line: Omit<CartLine, "key">) => void;
}) {
  const key = [...new Set(cartProductIds)].sort().join(",");
  const [suggestions, setSuggestions] = useState<CartSuggestion[]>([]);
  const [selected, setSelected] = useState<{ category: Category; product: Product } | null>(null);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      cartSuggestions(storeId, key.split(","))
        .then((s) => {
          if (!cancelled) setSuggestions(s);
        })
        .catch(() => {});
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [key, storeId]);

  const items = useMemo(() => {
    const find = (id: string) => {
      for (const category of menu) {
        const product = category.products.find((p) => p.id === id);
        if (product) return { category, product };
      }
      return null;
    };
    const inCart = new Set(key.split(","));
    const list: Item[] = [];
    for (const s of suggestions) {
      if (inCart.has(s.productId)) continue;
      const found = find(s.productId);
      if (!found) continue; // pausado ou fora do cardápio público
      const source = s.sourceProductId ? find(s.sourceProductId)?.product.name : null;
      const label =
        s.reason === "together" && source
          ? `Quem pede ${source} costuma levar`
          : s.reason === "pinned"
            ? "Sugestão da casa"
            : "Peça também";
      list.push({ suggestion: s, ...found, label });
    }
    return list;
  }, [suggestions, menu, key]);

  if (!key || !items.length) return null;

  return (
    <section className="min-w-0 rounded-2xl border border-border bg-card p-5" aria-labelledby="sugestoes-titulo">
      <h2 id="sugestoes-titulo" className="flex items-center gap-2 font-semibold">
        <Sparkles className="size-4 text-brand" /> Que tal adicionar?
      </h2>
      <ul className="mt-3 grid min-w-0 gap-2">
        {items.map(({ suggestion, category, product, label }) => {
          const price = startingPrice(category, product);
          return (
            <li key={suggestion.productId} className="min-w-0">
              <button
                type="button"
                onClick={() => setSelected({ category, product })}
                className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-border p-2.5 text-left transition hover:border-brand/40 hover:bg-muted/40"
              >
                {product.image_url ? (
                  <span className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                    <Image src={product.image_url} alt="" fill sizes="56px" className="object-cover" />
                  </span>
                ) : null}
                <span className="min-w-0 flex-1">
                  <span className="block text-xs leading-snug text-muted-foreground">{label}</span>
                  <span className="block truncate font-semibold">{product.name}</span>
                  {price !== null ? (
                    <span className="block text-sm">
                      {category.has_sizes && product.prices.length > 1 ? "a partir de " : ""}
                      {formatBRL(price)}
                    </span>
                  ) : null}
                </span>
                <span
                  aria-hidden
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground"
                >
                  <Plus className="size-4" />
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {selected ? (
        <ProductDialog
          key={selected.product.id}
          open
          category={selected.category}
          product={selected.product}
          canOrder={canOrder}
          onClose={() => setSelected(null)}
          onAdd={(line) => {
            onAdd(line);
            setSelected(null);
          }}
        />
      ) : null}
    </section>
  );
}
