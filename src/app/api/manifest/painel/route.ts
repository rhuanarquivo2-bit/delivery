import { APP_NAME } from "@/lib/brand";
import { fixedIcon, manifestIcons } from "@/lib/push/app-icon";

/** App do painel (para instalar no celular e receber aviso de pedido novo). */
export function GET() {
  return Response.json(
    {
      name: `${APP_NAME} · Painel`,
      short_name: "Painel",
      id: "/painel",
      start_url: "/painel/pedidos",
      scope: "/",
      display: "standalone",
      background_color: "#ffffff",
      theme_color: "#e4572e",
      lang: "pt-BR",
      icons: manifestIcons((size) => fixedIcon("painel", size)),
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } },
  );
}
