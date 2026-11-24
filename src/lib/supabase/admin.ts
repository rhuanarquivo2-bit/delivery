import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./env";

/**
 * Cliente com a chave secreta (ignora as regras de acesso). Só para o servidor e só para
 * o que o navegador nunca pode fazer: ler o token de recebimento da loja e confirmar pagamentos.
 */
const secretKey = process.env.SUPABASE_SECRET_KEY ?? "";

export const isAdminConfigured = Boolean(supabaseUrl && secretKey);

export function createAdminClient() {
  if (!isAdminConfigured) throw new Error("SUPABASE_SECRET_KEY não configurada");
  return createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
