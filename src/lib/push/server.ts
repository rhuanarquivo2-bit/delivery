import "server-only";
import webpush from "web-push";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";

const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const privateKey = process.env.VAPID_PRIVATE_KEY ?? "";
const subject = process.env.VAPID_SUBJECT || "mailto:contato@fomely.app";

/** Notificações ligadas: chaves VAPID + chave secreta do Supabase configuradas. */
export const isPushConfigured = Boolean(publicKey && privateKey && isAdminConfigured);

let ready = false;
function setup() {
  if (!ready) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    ready = true;
  }
}

export type PushPayload = { title: string; body: string; url: string; tag?: string; icon?: string | null };
export type PushTarget =
  | { audience: "store"; storeId: string }
  | { audience: "courier"; courierId: string }
  | { audience: "customer"; orderId: string };

export type SubscriptionInput = { endpoint: string; keys: { p256dh: string; auth: string } };

/** Guarda o aparelho (troca a linha se o mesmo aparelho já seguia o mesmo alvo). */
export async function saveSubscription(
  sub: SubscriptionInput,
  target: { storeId: string; audience: "store"; userId: string } | { storeId: string; audience: "courier"; courierId: string } | { storeId: string; audience: "customer"; orderId: string },
) {
  if (!isPushConfigured) return false;
  const admin = createAdminClient();
  const row = {
    store_id: target.storeId,
    audience: target.audience,
    user_id: target.audience === "store" ? target.userId : null,
    courier_id: target.audience === "courier" ? target.courierId : null,
    order_id: target.audience === "customer" ? target.orderId : null,
    endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
  };
  let del = admin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint).eq("audience", target.audience);
  if (target.audience === "store") del = del.eq("user_id", target.userId);
  if (target.audience === "courier") del = del.eq("courier_id", target.courierId);
  if (target.audience === "customer") del = del.eq("order_id", target.orderId);
  await del;
  const { error } = await admin.from("push_subscriptions").insert(row);
  return !error;
}

/** Desliga este aparelho para um tipo de aviso (e, no cliente, só para aquele pedido). */
export async function removeSubscription(endpoint: string, audience: PushTarget["audience"], orderId?: string) {
  if (!isPushConfigured) return;
  let q = createAdminClient().from("push_subscriptions").delete().eq("endpoint", endpoint).eq("audience", audience);
  if (orderId) q = q.eq("order_id", orderId);
  await q;
}

/** Envia para todos os aparelhos do alvo. Aparelho que não existe mais é apagado. Nunca lança erro. */
export async function sendPush(target: PushTarget, payload: PushPayload) {
  if (!isPushConfigured) return 0;
  try {
    setup();
    const admin = createAdminClient();
    let q = admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("audience", target.audience);
    if (target.audience === "store") q = q.eq("store_id", target.storeId);
    if (target.audience === "courier") q = q.eq("courier_id", target.courierId);
    if (target.audience === "customer") q = q.eq("order_id", target.orderId);
    const { data } = await q.limit(50);
    const subs = data ?? [];
    const body = JSON.stringify(payload);
    const gone: string[] = [];
    let sent = 0;
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
            TTL: 60 * 60,
            urgency: "high",
            topic: payload.tag?.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || undefined,
          });
          sent++;
        } catch (err) {
          const code = (err as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) gone.push(s.id);
          else console.error("push", code ?? err);
        }
      }),
    );
    if (gone.length) await admin.from("push_subscriptions").delete().in("id", gone);
    return sent;
  } catch (err) {
    console.error("push", err);
    return 0;
  }
}
