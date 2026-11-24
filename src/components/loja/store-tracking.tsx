"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { GA_ID_PATTERN, PIXEL_ID_PATTERN, trackPurchase } from "@/lib/tracking";

/**
 * Facebook Pixel e Google Analytics da loja (configurados em Minha loja > Site e pedidos).
 * Os códigos são conferidos aqui e no banco: só números (Pixel) ou G-XXXX (Analytics).
 */
export function StoreTracking({ pixelId, gaId }: { pixelId: string | null; gaId: string | null }) {
  const pixel = pixelId && PIXEL_ID_PATTERN.test(pixelId) ? pixelId : null;
  const ga = gaId && GA_ID_PATTERN.test(gaId) ? gaId : null;
  const pathname = usePathname();
  const first = useRef(true);

  // Troca de página dentro do site (o primeiro PageView sai junto com o script).
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    window.fbq?.("track", "PageView");
    window.gtag?.("event", "page_view", { page_path: pathname, page_location: window.location.href });
  }, [pathname]);

  return (
    <>
      {pixel ? (
        <Script id="facebook-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixel}');fbq('track','PageView');`}
        </Script>
      ) : null}
      {ga ? (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${ga}`} strategy="afterInteractive" />
          <Script id="google-analytics" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config','${ga}');`}
          </Script>
        </>
      ) : null}
    </>
  );
}

/** Pedido confirmado: avisa o Pixel/Analytics uma vez só por pedido. */
export function TrackPurchase({ orderKey, totalCents }: { orderKey: string; totalCents: number }) {
  useEffect(() => {
    const key = `compra-registrada:${orderKey}`;
    try {
      if (window.localStorage.getItem(key)) return;
    } catch {
      // sem localStorage: registra assim mesmo
    }
    // espera os scripts carregarem
    const t = window.setTimeout(() => {
      if (!window.fbq && !window.gtag) return;
      trackPurchase(orderKey, totalCents);
      try {
        window.localStorage.setItem(key, "1");
      } catch {
        // ignora
      }
    }, 1500);
    return () => window.clearTimeout(t);
  }, [orderKey, totalCents]);
  return null;
}
