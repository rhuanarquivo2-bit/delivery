/** Ícones dos apps instalados (tela inicial) e das notificações. */

export const ICON_SIZES = [192, 512] as const;

/** Selo branco da barra de status do Android. */
export const BADGE_URL = "/icons/badge-96.png";

/** Ícones fixos do painel e do app do motoboy (em public/icons). */
export const fixedIcon = (app: "painel" | "entregador", size: 180 | 192 | 512) => `/icons/${app}-${size}.png`;

/** Ícone da loja: o logo, se houver; senão a inicial na cor da loja. `v` muda quando o logo muda. */
export function storeIconUrl(slug: string, size: 180 | 192 | 512, logoUrl?: string | null) {
  const v = logoUrl ? hash(logoUrl) : "0";
  return `/api/icone/loja/${encodeURIComponent(slug)}/${size}.png?v=${v}`;
}

/** Lista de ícones para o manifesto. */
export function manifestIcons(src: (size: 192 | 512) => string) {
  return ICON_SIZES.flatMap((size) => [
    { src: src(size), sizes: `${size}x${size}`, type: "image/png", purpose: "any" },
    { src: src(size), sizes: `${size}x${size}`, type: "image/png", purpose: "maskable" },
  ]);
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
