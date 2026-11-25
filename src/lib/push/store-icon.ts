import "server-only";
import sharp from "sharp";

/** Talheres do lucide (24x24), para a loja que ainda não tem logo. */
const UTENSILS = ["M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2", "M7 2v20", "M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"];

function mix(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => {
    const v = (n >> shift) & 255;
    const t = amount > 0 ? v + (255 - v) * amount : v * (1 + amount);
    return Math.round(t).toString(16).padStart(2, "0");
  };
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

/** Degradê na cor da loja com os talheres brancos (não depende de fonte instalada). */
export async function glyphIcon(size: number, color: string) {
  const c = /^#[0-9a-f]{6}$/i.test(color) ? color : "#e4572e";
  const g = size * 0.5;
  const off = (size - g) / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <defs><linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${mix(c, 0.22)}"/><stop offset="1" stop-color="${mix(c, -0.18)}"/></linearGradient></defs>
  <rect width="${size}" height="${size}" fill="url(#b)"/>
  <g transform="translate(${off} ${off}) scale(${g / 24})" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
  ${UTENSILS.map((d) => `<path d="${d}"/>`).join("")}</g></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * Logo centralizado com margem (o iPhone e o Android arredondam as bordas).
 * O fundo usa a cor do canto do logo, para o quadrado parecer parte da imagem.
 */
export async function logoIcon(size: number, logo: Buffer) {
  const img = sharp(logo).rotate();
  const { data, info } = await img.clone().resize(8, 8, { fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = (i: number) => data.slice(i * info.channels, i * info.channels + 4);
  const corners = [0, 7, 56, 63].map(px);
  const opaque = corners.every((p) => p[3] > 200);
  const avg = (k: number) => Math.round(corners.reduce((n, p) => n + p[k], 0) / 4);
  const background = opaque ? { r: avg(0), g: avg(1), b: avg(2), alpha: 1 } : { r: 255, g: 255, b: 255, alpha: 1 };
  const inner = Math.round(size * (opaque ? 0.84 : 0.72));
  const fitted = await img.resize(inner, inner, { fit: "contain", background }).flatten({ background }).toBuffer();
  return sharp({ create: { width: size, height: size, channels: 3, background } })
    .composite([{ input: fitted, gravity: "center" }])
    .png()
    .toBuffer();
}
