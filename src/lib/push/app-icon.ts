/** Endereço do ícone gerado (letra branca num quadrado da cor da marca). */
export function appIconUrl(size: number, letter = "F", color = "#e4572e") {
  const l = (letter.trim()[0] ?? "F").toUpperCase();
  const c = /^#[0-9a-f]{6}$/i.test(color) ? color.slice(1) : "e4572e";
  return `/api/icone/${size}?l=${encodeURIComponent(l)}&c=${c}`;
}

export const ICON_SIZES = [192, 512] as const;

/** Lista de ícones para o manifesto. */
export function manifestIcons(letter?: string, color?: string) {
  return ICON_SIZES.flatMap((size) => [
    { src: appIconUrl(size, letter, color), sizes: `${size}x${size}`, type: "image/png", purpose: "any" },
    { src: appIconUrl(size, letter, color), sizes: `${size}x${size}`, type: "image/png", purpose: "maskable" },
  ]);
}
