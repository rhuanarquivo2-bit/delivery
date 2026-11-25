import { getPublicStore } from "@/lib/stores";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { manifestIcons, storeIconUrl } from "@/lib/push/app-icon";

/** App da loja para o cliente (instalar na tela inicial e receber o status do pedido). */
export async function GET(_req: Request, { params }: RouteContext<"/api/manifest/loja/[slug]">) {
  const { slug } = await params;
  const store = isSupabaseConfigured ? (await getPublicStore(slug))?.store : null;
  if (!store) return new Response("Não encontrado", { status: 404 });
  return Response.json(
    {
      name: store.name,
      short_name: store.name.slice(0, 24),
      id: `/loja/${store.slug}`,
      start_url: `/loja/${store.slug}`,
      scope: "/",
      display: "standalone",
      background_color: "#ffffff",
      theme_color: store.primary_color,
      lang: "pt-BR",
      icons: manifestIcons((size) => storeIconUrl(store.slug, size, store.logo_url)),
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } },
  );
}
