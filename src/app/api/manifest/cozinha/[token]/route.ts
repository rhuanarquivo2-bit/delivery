import { kitchenManifest } from "@/lib/kitchen-manifest";

/** Link da cozinha (sem login) como app na tela inicial do tablet. */
export async function GET(_req: Request, { params }: RouteContext<"/api/manifest/cozinha/[token]">) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) return new Response("Não encontrado", { status: 404 });
  return Response.json(kitchenManifest(`/cozinha/${token}`), {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "private, max-age=3600" },
  });
}
