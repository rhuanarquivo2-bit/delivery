"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { endOfDayBR } from "@/lib/access";
import { requirePlatformAdmin } from "@/lib/platform";
import { createClient } from "@/lib/supabase/server";

export type AdminResult = { ok: boolean; message?: string };

const id = z.string().uuid();

async function run(fn: string, args: Record<string, unknown>): Promise<AdminResult> {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, message: "Não foi possível salvar. Tente de novo." };
  revalidatePath("/admin");
  return { ok: true };
}

/** Soma dias à validade (a partir de hoje, se já venceu). */
export async function extendStore(storeId: string, days: number) {
  if (!id.safeParse(storeId).success || !Number.isInteger(days) || days < 1 || days > 3660) {
    return { ok: false, message: "Quantidade de dias inválida." };
  }
  return run("admin_extend_store", { p_store_id: storeId, p_days: days });
}

/** Validade numa data exata (fim do dia, horário de Brasília). Vazio = sem prazo. */
export async function setStoreUntil(storeId: string, date: string) {
  if (!id.safeParse(storeId).success) return { ok: false, message: "Loja inválida." };
  const until = date ? endOfDayBR(date) : null;
  if (date && !until) return { ok: false, message: "Data inválida." };
  return run("admin_set_store_until", { p_store_id: storeId, p_until: until });
}

export async function setStoreBlocked(storeId: string, blocked: boolean, reason: string) {
  if (!id.safeParse(storeId).success) return { ok: false, message: "Loja inválida." };
  return run("admin_set_store_blocked", { p_store_id: storeId, p_blocked: blocked, p_reason: reason.slice(0, 200) });
}

export async function saveStoreNote(storeId: string, note: string) {
  if (!id.safeParse(storeId).success) return { ok: false, message: "Loja inválida." };
  return run("admin_save_note", { p_store_id: storeId, p_note: note.slice(0, 1000) });
}

const settingsSchema = z.object({
  trial_days: z.coerce.number().int().min(0, "Mínimo 0 dias.").max(365, "Máximo 365 dias."),
  support_whatsapp: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v === "" || (v.length >= 10 && v.length <= 13), "WhatsApp com DDD, ex.: (31) 99999-0000."),
});

export async function savePlatformSettings(_: AdminResult, formData: FormData): Promise<AdminResult> {
  const parsed = settingsSchema.safeParse({
    trial_days: formData.get("trial_days"),
    support_whatsapp: String(formData.get("support_whatsapp") ?? ""),
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const r = await run("admin_save_settings", {
    p_trial_days: parsed.data.trial_days,
    p_support_whatsapp: parsed.data.support_whatsapp || null,
  });
  return r.ok ? { ok: true, message: "Configuração salva." } : r;
}
