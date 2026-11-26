import { getPublicStore } from "@/lib/stores";
import { isSupabaseConfigured, supabaseUrl } from "@/lib/supabase/env";
import { glyphIcon, logoIcon } from "@/lib/push/store-icon";

const SIZES = new Set([180, 192, 512]);
const CACHE = { "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800" };

const png = (buf: Buffer) => new Response(new Uint8Array(buf), { headers: { "Content-Type": "image/png", ...CACHE } });

/** Ícone do app da loja: o logo; sem logo, talheres na cor da loja. */
export async function GET(_req: Request, { params }: RouteContext<"/api/icone/loja/[slug]/[file]">) {
  const { slug, file } = await params;
  const size = Number(file.replace(/\.png$/, ""));
  if (!SIZES.has(size)) return new Response("Não encontrado", { status: 404 });
  const store = isSupabaseConfigured ? (await getPublicStore(slug))?.store : null;
  if (!store) return new Response("Não encontrado", { status: 404 });

  // Só busca o logo no armazenamento do próprio Supabase (nunca um endereço qualquer).
  if (store.logo_url && store.logo_url.startsWith(`${supabaseUrl}/storage/v1/object/public/`)) {
    try {
      const res = await fetch(store.logo_url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(String(res.status));
      return png(await logoIcon(size, Buffer.from(await res.arrayBuffer())));
    } catch (err) {
      console.error("ícone da loja", slug, err);
    }
  }
  return png(await glyphIcon(size, store.primary_color));
}
