"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Atualiza a página de tempos em tempos (status do pedido para o cliente). */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => window.clearInterval(id);
  }, [router, seconds]);
  return null;
}
