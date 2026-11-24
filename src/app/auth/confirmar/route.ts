import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Link do e-mail de confirmação de conta (e, no futuro, recuperação de senha). */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const proximo = searchParams.get("proximo") ?? "/painel";
  const destino = proximo.startsWith("/") && !proximo.startsWith("//") ? proximo : "/painel";

  const supabase = await createClient();
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  }

  const url = request.nextUrl.clone();
  url.search = "";
  url.pathname = ok ? destino : "/entrar";
  return NextResponse.redirect(url);
}
