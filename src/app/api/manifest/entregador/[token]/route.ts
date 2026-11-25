import { manifestIcons } from "@/lib/push/app-icon";

/** App do motoboy (o link dele vira um ícone na tela inicial). */
export async function GET(_req: Request, { params }: RouteContext<"/api/manifest/entregador/[token]">) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) return new Response("Não encontrado", { status: 404 });
  return Response.json(
    {
      name: "Minhas entregas",
      short_name: "Entregas",
      id: `/entregador/${token}`,
      start_url: `/entregador/${token}`,
      scope: `/entregador/${token}`,
      display: "standalone",
      background_color: "#ffffff",
      theme_color: "#e4572e",
      lang: "pt-BR",
      icons: manifestIcons("E"),
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "private, max-age=3600" } },
  );
}
