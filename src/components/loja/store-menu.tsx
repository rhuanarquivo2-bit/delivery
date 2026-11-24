"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Flame, Search, ShoppingBag, Tag } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { useCart } from "@/lib/cart";
import { activePromoName, discountPercent, startingPrice } from "@/lib/pricing";
import { trackAddToCart } from "@/lib/tracking";
import type { Category, Product } from "@/lib/types";
import { cn, formatBRL } from "@/lib/utils";
import { ProductDialog } from "./product-dialog";

type PromoItem = { category: Category; product: Product; promo: string; from: number; full: number };

/** Produtos com promoção valendo agora (para a janela de promoções). */
function promoItems(categories: Category[]): PromoItem[] {
  const items: PromoItem[] = [];
  for (const category of categories) {
    for (const product of category.products) {
      const promo = activePromoName(category, product);
      const from = startingPrice(category, product);
      const full = startingPrice(category, product, { withPromos: false });
      if (promo && from !== null && full !== null && full > from) items.push({ category, product, promo, from, full });
    }
  }
  return items.sort((a, b) => b.full - b.from - (a.full - a.from)).slice(0, 6);
}

export function StoreMenu({
  slug,
  storeName,
  categories,
  canOrder,
  promoPopup = false,
  bestSellers = [],
}: {
  slug: string;
  storeName?: string;
  categories: Category[];
  canOrder: boolean;
  promoPopup?: boolean;
  /** Ids dos produtos mais vendidos (selo "Mais pedido"). */
  bestSellers?: string[];
}) {
  const cart = useCart(slug);
  const [selected, setSelected] = useState<{ category: Category; product: Product } | null>(null);
  const [promos] = useState(() => (promoPopup ? promoItems(categories) : []));
  const [showPromos, setShowPromos] = useState(false);
  // Uma vez por visita (sessão do navegador), e só se houver promoção valendo agora.
  useEffect(() => {
    if (!promos.length) return;
    const key = `promos-vistas:${slug}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
    } catch {
      // sem sessionStorage (aba anônima restrita): mostra mesmo assim
    }
    const t = window.setTimeout(() => {
      setShowPromos(true);
      try {
        window.sessionStorage.setItem(key, "1");
      } catch {
        // ignora
      }
    }, 600);
    return () => window.clearTimeout(t);
  }, [promos, slug]);
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
                const off = discountPercent(full, from);
                const popular = bestSellers.includes(product.id);
                return (
                  <button
                    key={product.id}
                    onClick={() => setSelected({ category, product })}
                    className="flex cursor-pointer gap-3 rounded-2xl border border-border bg-card p-3 text-left transition hover:border-brand/40 hover:shadow-sm"
                  >
                    <div className="flex min-w-0 flex-1 flex-col py-1">
                      {popular || promo ? (
                        <div className="mb-1.5 flex flex-wrap gap-1">
                          {popular ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-800">
                              <Flame className="size-3" /> Mais pedido
                            </span>
                          ) : null}
                          {promo ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                              <Tag className="size-3" /> {promo}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                      <p className="font-semibold leading-snug">{product.name}</p>
                      {product.description ? (
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{product.description}</p>
                      ) : null}
                      {from !== null ? (
                        <p className="mt-auto flex flex-wrap items-baseline gap-x-1.5 pt-2 text-sm font-semibold">
                          {category.has_sizes && product.prices.length > 1 ? (
                            <span className="font-normal text-muted-foreground">a partir de</span>
                          ) : null}
                          {off ? <span className="font-normal text-muted-foreground line-through">{formatBRL(full!)}</span> : null}
                          <span className={off ? "text-base text-emerald-700" : "text-base"}>{formatBRL(from)}</span>
                        </p>
                      ) : null}
                    </div>
                    {product.image_url ? (
                      <div className="relative size-28 shrink-0 overflow-hidden rounded-xl bg-muted sm:size-32">
                        <Image src={product.image_url} alt="" fill sizes="128px" className="object-cover" />
                        {off ? (
                          <span className="absolute left-1.5 top-1.5 rounded-md bg-emerald-600 px-1.5 py-0.5 text-xs font-bold text-white shadow-sm">
                            -{off}%
                          </span>
                        ) : null}
                      </div>
                    ) : off ? (
                      <span className="h-fit shrink-0 rounded-md bg-emerald-600 px-1.5 py-0.5 text-xs font-bold text-white">-{off}%</span>
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
            trackAddToCart({
              id: line.selection.productId,
              name: line.title,
              price_cents: line.unitPriceCents,
              quantity: line.selection.quantity,
            });
            setAdded(true);
            setTimeout(() => setAdded(false), 1200);
          }}
        />
      ) : null}

      {showPromos ? (
        <Dialog open onClose={() => setShowPromos(false)} label="Promoções de hoje">
          <div className="grid gap-4 overflow-y-auto p-5">
            <div className="pr-10">
              <p className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                <Tag className="size-3.5" /> Promoções de hoje
              </p>
              <h2 className="mt-2 text-xl font-bold tracking-tight">
                {storeName ? `Aproveite na ${storeName}` : "Aproveite enquanto dura"}
              </h2>
            </div>
            <ul className="grid gap-2">
              {promos.map(({ category, product, promo, from, full }) => (
                <li key={product.id}>
                  <button
                    onClick={() => {
                      setShowPromos(false);
                      setSelected({ category, product });
                    }}
                    className="flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-border p-3 text-left hover:border-brand/40 hover:bg-muted/40"
                  >
                    {product.image_url ? (
                      <div className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-muted">
                        <Image src={product.image_url} alt="" fill sizes="56px" className="object-cover" />
                      </div>
                    ) : null}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{product.name}</span>
                      <span className="block truncate text-xs text-emerald-700">{promo}</span>
                    </span>
                    <span className="shrink-0 text-right text-sm">
                      <span className="block text-xs text-muted-foreground line-through">{formatBRL(full)}</span>
                      <span className="block font-bold text-emerald-700">{formatBRL(from)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <button
              onClick={() => setShowPromos(false)}
              className="h-11 cursor-pointer rounded-xl bg-brand text-sm font-semibold text-brand-foreground"
            >
              Ver o cardápio completo
            </button>
          </div>
        </Dialog>
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
