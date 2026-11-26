import type { NextConfig } from "next";

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

// Cabeçalhos de segurança em todas as páginas.
const securityHeaders = [
  // só HTTPS por 2 anos
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // o navegador não "adivinha" o tipo dos arquivos
  { key: "X-Content-Type-Options", value: "nosniff" },
  // ninguém coloca o site dentro de outro site para enganar cliques
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'" },
  // não manda o endereço completo das páginas (com links de pedido) para outros sites
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self), payment=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  experimental: {
    // Logo e, nas próximas fases, fotos do cardápio passam por Server Actions.
    serverActions: { bodySizeLimit: "6mb" },
  },
  images: {
    remotePatterns: supabaseHost ? [{ protocol: "https", hostname: supabaseHost }] : [],
  },
};

export default nextConfig;
