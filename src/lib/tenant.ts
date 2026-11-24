import { SLUG_PATTERN } from "./utils";

/** Subdomínios que pertencem à plataforma e nunca são lojas. */
const RESERVED = new Set(["www", "app", "painel", "api", "demo", "entregador"]);

/**
 * Descobre a loja pelo subdomínio.
 * Com NEXT_PUBLIC_ROOT_DOMAIN=suamarca.com.br:
 *   pizzaria.suamarca.com.br -> "pizzaria"
 *   pizzaria.localhost:3000  -> "pizzaria" (desenvolvimento)
 */
export function storeSlugFromHost(host: string | null): string | null {
  if (!host) return null;
  const hostname = host.split(":")[0].toLowerCase();
  const root = (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "").toLowerCase();

  let sub: string | null = null;
  if (hostname.endsWith(".localhost")) {
    sub = hostname.slice(0, -".localhost".length);
  } else if (root && hostname.endsWith(`.${root}`)) {
    sub = hostname.slice(0, -(root.length + 1));
  }

  if (!sub || sub.includes(".") || RESERVED.has(sub) || !SLUG_PATTERN.test(sub)) return null;
  return sub;
}

export const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "";

/** Domínio mostrado nos formulários enquanto o domínio real não estiver configurado. */
export const rootDomainLabel = rootDomain || "seudominio.com.br";

/** Link público do site da loja. Sem domínio configurado, usa /loja/<slug>. */
export function storeUrl(slug: string) {
  return rootDomain ? `https://${slug}.${rootDomain}` : `/loja/${slug}`;
}
