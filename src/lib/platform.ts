import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { requireUser } from "./stores";
import { createClient } from "./supabase/server";

/** O usuário logado é o administrador da plataforma (dono do sistema)? */
export const isPlatformAdmin = cache(async () => {
  const user = await requireUser();
  if (user.isAnonymous) return false;
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_platform_admin");
  return data === true;
});

/** Só o administrador da plataforma passa; para os outros a página "não existe". */
export async function requirePlatformAdmin() {
  if (!(await isPlatformAdmin())) notFound();
}

export type PlatformSettings = { trial_days: number; support_whatsapp: string | null };

export const getPlatformSettings = cache(async (): Promise<PlatformSettings> => {
  const supabase = await createClient();
  const { data } = await supabase.from("platform_settings").select("trial_days, support_whatsapp").maybeSingle();
  return { trial_days: data?.trial_days ?? 7, support_whatsapp: data?.support_whatsapp ?? null };
});

export type AdminStore = {
  id: string;
  slug: string;
  name: string;
  created_at: string;
  access_until: string | null;
  blocked: boolean;
  blocked_reason: string | null;
  owner_email: string | null;
  phone: string | null;
  whatsapp: string | null;
  orders_total: number;
  orders_30d: number;
  last_order_at: string | null;
  note: string | null;
};

export async function listAdminStores(): Promise<AdminStore[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_stores");
  if (error) throw new Error(error.message);
  return ((data ?? []) as AdminStore[]).map((s) => ({
    ...s,
    orders_total: Number(s.orders_total),
    orders_30d: Number(s.orders_30d),
  }));
}
