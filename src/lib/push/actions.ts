"use server";

import { z } from "zod";
import { requireMyStore, requireUser } from "@/lib/stores";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPushConfigured, removeSubscription, saveSubscription } from "./server";

const subSchema = z.object({
  endpoint: z.string().url().startsWith("https://").max(1000),
  keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }),
});

export type PushFor = { audience: "store" } | { audience: "courier"; token: string } | { audience: "customer"; token: string };

/** Liga as notificações deste aparelho para o painel, o motoboy ou o pedido do cliente. */
export async function subscribePush(raw: unknown, target: PushFor) {
  if (!isPushConfigured) return { ok: false as const, message: "Notificações ainda não foram configuradas." };
  const parsed = subSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, message: "Aparelho não suportado." };
  const sub = parsed.data;

  if (target.audience === "store") {
    const user = await requireUser();
    const { store } = await requireMyStore();
    const ok = await saveSubscription(sub, { audience: "store", storeId: store.id, userId: user.id });
    return ok ? { ok: true as const } : { ok: false as const, message: "Não deu certo. Tente de novo." };
  }

  if (!z.string().uuid().safeParse(target.token).success) return { ok: false as const, message: "Link inválido." };
  const admin = createAdminClient();

  if (target.audience === "courier") {
    const { data } = await admin
      .from("couriers")
      .select("id, store_id, active")
      .eq("access_token", target.token)
      .maybeSingle();
    if (!data?.active) return { ok: false as const, message: "Link inválido." };
    const ok = await saveSubscription(sub, { audience: "courier", storeId: data.store_id, courierId: data.id });
    return ok ? { ok: true as const } : { ok: false as const, message: "Não deu certo. Tente de novo." };
  }

  const { data } = await admin.from("orders").select("id, store_id").eq("public_token", target.token).maybeSingle();
  if (!data) return { ok: false as const, message: "Pedido não encontrado." };
  const ok = await saveSubscription(sub, { audience: "customer", storeId: data.store_id, orderId: data.id });
  return ok ? { ok: true as const } : { ok: false as const, message: "Não deu certo. Tente de novo." };
}

/** Desliga este aparelho (o endpoint é segredo do próprio aparelho). */
export async function unsubscribePush(endpoint: string, target: PushFor) {
  if (!isPushConfigured || !z.string().url().max(1000).safeParse(endpoint).success) return { ok: false as const };
  if (target.audience === "customer") {
    if (!z.string().uuid().safeParse(target.token).success) return { ok: false as const };
    const { data } = await createAdminClient().from("orders").select("id").eq("public_token", target.token).maybeSingle();
    if (data) await removeSubscription(endpoint, "customer", data.id);
  } else {
    await removeSubscription(endpoint, target.audience);
  }
  return { ok: true as const };
}
