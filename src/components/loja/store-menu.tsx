"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Search, ShoppingBag, Tag } from "lucide-react";
import { useCart } from "@/lib/cart";
import { activePromoName, startingPrice } from "@/lib/pricing";
import type { Category, Product } from "@/lib/types";
import { cn, formatBRL } from "@/lib/utils";
import { ProductDialog } from "./product-dialog";

export function StoreMenu({
  slug,
  categories,
  canOrder,
}: {
  slug: string;
  categories: Category[];
  canOrder: boolean;
}) {
  const cart = useCart(slug);
  const [selected, setSelected] = useState<{ category: Category; product: Product } | null>(null);
  const [query, setQuery] = useState("");
  const [added, setAdded] = useState(false);

  const normalize = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const q = normalize(query.trim());
  const visible = q
    ? categories
        .map((c) => ({
          ...c,
          products: c.products.filter((p) => normalize(`${p.name} ${p.description ?? ""}`).includes(q)),
        }))
        .filter((c) => c.products.length)
    : categories;

  if (categories.length === 0) {
    return (
      <section className="mt-6 rounded-3xl border border-dashed border-border bg-card/50 px-6 py-12 text-center">
        <h2 className="text-lg font-semibold">Cardápio em preparação</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Volte daqui a pouco!</p>
      </section>
    );
  }

  return (
    <>
      <div className="sticky top-0 z-20 -mx-4 mt-6 border-b border-border bg-background/90 px-4 pb-3 pt-3 backdrop-blur">
        <label className="flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-3.5 text-sm focus-within:border-brand">
          <Search className="size-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar no cardápio"
            aria-label="Buscar no cardápio"
            className="w-full bg-transparent outline-none"
          />
        </label>
        {!q ? (
          <nav className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
            {categories.map((c) => (
              <a
                key={c.id}
                href={`#cat-${c.id}`}
                className="shrink-0 rounded-full border border-border bg-card px-3.5 py-1.5 text-sm font-medium hover:border-brand hover:text-brand"
              >
                {c.name}
              </a>
            ))}
          </nav>
        ) : null}
      </div>

      <div className="mt-4 grid gap-8">
        {visible.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Nada encontrado para “{query}”.</p>
        ) : null}
        {visible.map((category) => (
          <section key={category.id} id={`cat-${category.id}`} className="scroll-mt-36">
            <h2 className="text-xl font-bold tracking-tight">{category.name}</h2>
            {category.description ? (
              <p className="mt-0.5 text-sm text-muted-foreground">{category.description}</p>
            ) : null}
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {category.products.map((product) => {
                const from = startingPrice(category, product);
                const full = startingPrice(category, product, { withPromos: false });
                const promo = activePromoName(category, product);
                return (
                  <button
                    key={product.id}
                    onClick={() => setSelected({ category, product })}
                    className="flex cursor-pointer gap-3 rounded-2xl border border-border bg-card p-3 text-left transition hover:border-brand/40 hover:shadow-sm"
                  >
                    <div className="min-w-0 flex-1 py-1">
                      {promo ? (
                        <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                          <Tag className="size-3" /> {promo}
                        </span>
                      ) : null}
                      <p className="font-semibold">{product.name}</p>
                      {product.description ? (
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{product.description}</p>
                      ) : null}
                      {from !== null ? (
                        <p className="mt-2 text-sm font-semibold">
                          {category.has_sizes && product.prices.length > 1 ? (
                            <span className="font-normal text-muted-foreground">a partir de </span>
                          ) : null}
                          {full !== null && full > from ? (
                            <span className="mr-1.5 font-normal text-muted-foreground line-through">{formatBRL(full)}</span>
                          ) : null}
                          <span className={full !== null && full > from ? "text-emerald-700" : undefined}>{formatBRL(from)}</span>
                        </p>
                      ) : null}
                    </div>
                    {product.image_url ? (
                      <div className="relative size-24 shrink-0 overflow-hidden rounded-xl bg-muted">
                        <Image src={product.image_url} alt="" fill sizes="96px" className="object-cover" />
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {selected ? (
        <ProductDialog
          key={selected.product.id}
          open
          category={selected.category}
          product={selected.product}
          canOrder={canOrder}
          onClose={() => setSelected(null)}
          onAdd={(line) => {
            cart.add(line);
            setAdded(true);
            setTimeout(() => setAdded(false), 1200);
          }}
        />
      ) : null}

      {cart.count > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-30 p-3 sm:p-4">
          <Link
            href={`/loja/${slug}/checkout`}
            className={cn(
              "mx-auto flex h-14 max-w-3xl items-center justify-between rounded-2xl bg-brand px-5 font-semibold text-brand-foreground shadow-lg transition-transform",
              added && "scale-[1.02]",
            )}
          >
            <span className="flex items-center gap-2">
              <ShoppingBag className="size-5" />
              <span>Ver carrinho</span>
              <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">{cart.count}</span>
            </span>
            <span>{formatBRL(cart.subtotal)}</span>
          </Link>
        </div>
      ) : null}
    </>
  );
}
