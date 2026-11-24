import "server-only";
import { createClient } from "./supabase/server";
import type { Category } from "./types";

const bySort = <T extends { sort_order: number }>(a: T, b: T) => a.sort_order - b.sort_order;

/**
 * Cardápio completo da loja, já ordenado.
 * `publicOnly` esconde categorias, produtos e adicionais pausados (site do cliente).
 */
export async function getMenu(storeId: string, { publicOnly = false } = {}): Promise<Category[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .select(
      "*, sizes:category_sizes(*), groups:option_groups(*, options(*)), products(*, prices:product_prices(*))",
    )
    .eq("store_id", storeId);
  if (error || !data) return [];

  const categories = (data as Category[])
    .map((c) => ({
      ...c,
      sizes: [...c.sizes].sort(bySort),
      groups: [...c.groups]
        .sort(bySort)
        .map((g) => ({
          ...g,
          options: [...g.options].sort(bySort).filter((o) => !publicOnly || o.active),
        })),
      products: [...c.products]
        .sort(bySort)
        .filter((p) => !publicOnly || p.active)
        .filter((p) => !publicOnly || (c.has_sizes ? p.prices.length > 0 : p.price_cents !== null)),
    }))
    .sort(bySort);

  return publicOnly ? categories.filter((c) => c.active && c.products.length > 0) : categories;
}
