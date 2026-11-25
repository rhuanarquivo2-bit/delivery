import { ImageResponse } from "next/og";

const ALLOWED = new Set([96, 180, 192, 512]);

/** Ícone do app instalado: letra branca num quadrado da cor da loja. */
export async function GET(request: Request, { params }: RouteContext<"/api/icone/[size]">) {
  const { size: raw } = await params;
  const size = ALLOWED.has(Number(raw)) ? Number(raw) : 192;
  const url = new URL(request.url);
  const letter = (url.searchParams.get("l") ?? "F").trim().slice(0, 1).toUpperCase() || "F";
  const c = url.searchParams.get("c") ?? "";
  const color = /^[0-9a-f]{6}$/i.test(c) ? `#${c}` : "#e4572e";
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: color,
          color: "white",
          fontSize: size * 0.56,
          fontWeight: 800,
        }}
      >
        {letter}
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=86400, immutable" } },
  );
}
