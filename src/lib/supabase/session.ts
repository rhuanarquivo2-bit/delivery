import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured, supabaseKey, supabaseUrl } from "./env";

/**
 * Renova o cookie de sessão a cada navegação e devolve o usuário logado (ou null).
 * `response` é o NextResponse que deve seguir adiante (já com os cookies atualizados).
 */
export async function updateSession(request: NextRequest, response: NextResponse) {
  if (!isSupabaseConfigured) return { response, userId: null as string | null };

  let current = response;
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        current = NextResponse.next({ request });
        // Preserva um rewrite feito antes (subdomínio da loja).
        const rewrite = response.headers.get("x-middleware-rewrite");
        if (rewrite) current = NextResponse.rewrite(rewrite, { request });
        for (const { name, value, options } of cookiesToSet) {
          current.cookies.set(name, value, options);
        }
        for (const [key, value] of Object.entries(headers ?? {})) {
          current.headers.set(key, value);
        }
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  return { response: current, userId: (data?.claims?.sub as string | undefined) ?? null };
}
