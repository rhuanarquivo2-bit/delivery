"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getMyStore } from "@/lib/stores";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Entra na demonstração: cria um usuário anônimo (sem e-mail nem senha) e uma loja de
 * exemplo só dele, cheia de dados. Quem já está na demonstração volta para a mesma loja.
 */
export async function startDemo() {
  if (!isSupabaseConfigured) redirect("/demo?erro=config");
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) {
      console.error("demo: signInAnonymously", error.message);
      redirect("/demo?erro=anonimo");
    }
  }
  const { error } = await supabase.rpc("create_demo_store");
  if (error) {
    if (error.message === "ja_tem_loja") redirect("/painel");
    console.error("demo: create_demo_store", error.message);
    redirect("/demo?erro=loja");
  }
  redirect("/painel?demo=1");
}

/** Um pedido de cliente de mentira chega no painel (com som, se estiver ligado). */
export async function simulateDemoOrder() {
  const mine = await getMyStore();
  if (!mine?.store.is_demo) return { ok: false as const, message: "Só na demonstração." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("demo_simulate_order", { p_store_id: mine.store.id });
  if (error) return { ok: false as const, message: "Não deu para simular agora. Tente de novo." };
  revalidatePath("/painel", "layout");
  return { ok: true as const, number: (data as { number: number }).number };
}

/** Sai da demonstração e vai para o cadastro da loja de verdade. */
export async function leaveDemo() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/entrar?modo=cadastro");
}
