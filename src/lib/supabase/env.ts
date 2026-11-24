export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

/** false enquanto o projeto do Supabase ainda não foi configurado no .env.local */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);
