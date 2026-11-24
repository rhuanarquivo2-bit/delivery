/**
 * Limpa a URL do projeto: aceita também o endereço copiado com /rest/v1, /auth/v1,
 * barra no final ou espaços, que quebrariam o login e o banco.
 */
export function normalizeSupabaseUrl(raw: string | undefined): string {
  return (raw ?? "")
    .trim()
    .replace(/\/+(rest|auth|storage|realtime|functions)\/v1\/?.*$/i, "")
    .replace(/\/+$/, "");
}

export const supabaseUrl = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
export const supabaseKey = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "").trim();

/** false enquanto o projeto do Supabase ainda não foi configurado no .env.local */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);
