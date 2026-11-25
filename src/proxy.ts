import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/session";
import { storeSlugFromHost } from "@/lib/tenant";

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // pizzariadojoao.suamarca.com.br/qualquer-coisa -> /loja/pizzariadojoao/qualquer-coisa
  const slug = storeSlugFromHost(request.headers.get("host"));
  let response = NextResponse.next({ request });
  if (slug && !/^\/(loja|api|entregador)\//.test(pathname) && pathname !== "/sw.js") {
    const url = request.nextUrl.clone();
    url.pathname = `/loja/${slug}${pathname === "/" ? "" : pathname}`;
    response = NextResponse.rewrite(url, { request });
  }

  const session = await updateSession(request, response);

  if ((pathname.startsWith("/painel") || pathname.startsWith("/imprimir") || pathname.startsWith("/admin")) && !session.userId) {
    const url = request.nextUrl.clone();
    url.pathname = "/entrar";
    url.search = `?voltar=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  return session.response;
}

export const config = {
  matcher: [
    // Tudo, menos arquivos estáticos e imagens.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
