import "server-only";
import { createClient } from "./supabase/server";
import { isPromotionLive } from "./promotions";
import type { Category, LivePromo, Promotion } from "./types";

const bySort = <T extends { sort_order: number }>(a: T, b: T) => a.sort_order - b.sort_order;

/**
 * Cardápio completo da loja, já ordenado.
 * `publicOnly` esconde categorias, produtos e adicionais pausados (site do cliente).
 */
export async function getMenu(storeId: string, { publicOnly = false } = {}): Promise<Category[]> {
  const supabase = await createClient();
  const [{ data, error }, promotions] = await Promise.all([
    supabase
      .from("categories")
      .select(
        "*, sizes:category_sizes(*), groups:option_groups(*, options(*)), products(*, prices:product_prices(*))",
      )
      .eq("store_id", storeId),
    publicOnly ? getPromotions(storeId) : Promise.resolve([] as Promotion[]),
  ]);
  if (error || !data) return [];

  // No site, cada produto já leva as promoções que valem agora (o banco confere de novo no pedido).
  const now = new Date();
  const live = promotions.filter((p) => isPromotionLive(p, now));
  const promosFor = (productId: string, categoryId: string): LivePromo[] =>
    live
      .filter((p) => p.product_id === productId || p.category_id === categoryId)
      .map(({ name, kind, value }) => ({ name, kind, value }));

  const categories = (data as Category[])
    .map((c) => {
      const groups = [...c.groups]
        .sort(bySort)
        .map((g) => ({
          ...g,
          options: [...g.options].sort(bySort).filter((o) => !publicOnly || o.active),
        }));
      // Grupos com product_id são escolhas de um produto só (ex.: sabor do refrigerante).
      const ofProduct = (id: string) => groups.filter((g) => g.product_id === id);
      return {
        ...c,
        sizes: [...c.sizes].sort(bySort),
        groups: groups.filter((g) => !g.product_id),
        products: [...c.products]
          .sort(bySort)
          .map((p) => ({ ...p, groups: ofProduct(p.id) }))
          .filter((p) => !publicOnly || p.active)
          .filter((p) => !publicOnly || (c.has_sizes ? p.prices.length > 0 : p.price_cents !== null))
          // escolha obrigatória sem nenhuma opção disponível (todos os sabores acabaram): sai do site
          .filter((p) => !publicOnly || p.groups.every((g) => g.options.length >= g.min_select))
          .map((p) => (publicOnly ? { ...p, promos: promosFor(p.id, c.id) } : p)),
      };
    })
    .sort(bySort);

  return publicOnly ? categories.filter((c) => c.active && c.products.length > 0) : categories;
}

export async function getPromotions(storeId: string): Promise<Promotion[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("promotions")
    .select("*")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false });
  return (data as Promotion[] | null) ?? [];
}

/** Produtos mais vendidos da loja nos últimos 30 dias (selo "Mais pedido" no site). */
export async function getBestSellers(storeId: string, limit = 3): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("best_sellers", { p_store_id: storeId, p_limit: limit });
  return Array.isArray(data) ? (data as unknown[]).filter((id): id is string => typeof id === "string") : [];
}
