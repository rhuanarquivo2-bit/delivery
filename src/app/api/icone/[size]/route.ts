import { glyphIcon } from "@/lib/push/store-icon";

const ALLOWED = new Set([96, 180, 192, 512]);

/** Endereço antigo do ícone (apps instalados antes dos ícones novos continuam funcionando). */
export async function GET(request: Request, { params }: RouteContext<"/api/icone/[size]">) {
  const { size: raw } = await params;
  const size = ALLOWED.has(Number(raw)) ? Number(raw) : 192;
  const c = new URL(request.url).searchParams.get("c") ?? "";
  const buf = await glyphIcon(size, `#${c}`);
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" },
  });
}
