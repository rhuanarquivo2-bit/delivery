import { kitchenManifest } from "@/lib/kitchen-manifest";

/** Tela da cozinha com login, como app na tela inicial do tablet. */
export function GET() {
  return Response.json(kitchenManifest("/cozinha"), {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" },
  });
}
