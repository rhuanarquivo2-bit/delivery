import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type { DeliveryZone, Store, StoreHour, StoreRole } from "./types";

/** Usuário logado no painel. Redireciona para /entrar se não houver sessão. */
export const requireUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/entrar");
  return {
    id: data.claims.sub as string,
    email: (data.claims.email as string | undefined) ?? "",
    /** Visitante da demonstração (login anônimo, sem e-mail). */
    isAnonymous: data.claims.is_anonymous === true,
  };
});

/** Loja do usuário logado (a primeira, por enquanto cada conta administra uma loja). */
export const getMyStore = cache(async (): Promise<{ store: Store; role: StoreRole } | null> => {
  const user = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("store_members")
    .select("role, stores(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data?.stores) return null;
  return { store: data.stores as unknown as Store, role: data.role as StoreRole };
});

export async function requireMyStore() {
  const mine = await getMyStore();
  if (!mine) redirect("/painel");
  return mine;
}

export async function getStoreSettings(storeId: string) {
  const supabase = await createClient();
  const [hours, zones] = await Promise.all([
    supabase.from("store_hours").select("*").eq("store_id", storeId).order("weekday"),
    supabase.from("delivery_zones").select("*").eq("store_id", storeId).order("sort_order").order("neighborhood"),
  ]);
  return {
    hours: (hours.data ?? []) as StoreHour[],
    zones: (zones.data ?? []) as DeliveryZone[],
  };
}

/** Dados públicos da loja para o site do cliente. */
export const getPublicStore = cache(async (slug: string) => {
  const supabase = await createClient();
  const { data: store } = await supabase.from("stores").select("*").eq("slug", slug).maybeSingle();
  if (!store) return null;
  const settings = await getStoreSettings(store.id);
  return { store: store as Store, ...settings };
});
