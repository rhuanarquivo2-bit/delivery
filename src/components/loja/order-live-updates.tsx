"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { orderStamp } from "@/app/loja/[slug]/actions";

/**
 * Mantém a página do pedido em dia para o cliente.
 * - pergunta o estado do pedido a cada `seconds` segundos (resposta pequena);
 * - só recarrega a página quando algo mudou;
 * - confere na hora quando o cliente volta para a tela (app no iPhone/Android
 *   pausa a página em segundo plano e os timers param).
 */
export function OrderLiveUpdates({ token, stamp, seconds = 5 }: { token: string; stamp: string; seconds?: number }) {
  const router = useRouter();
  const current = useRef(stamp);
  const busy = useRef(false);

  useEffect(() => {
    current.current = stamp;
  }, [stamp]);

  useEffect(() => {
    let stopped = false;
    const check = async () => {
      if (stopped || busy.current || document.visibilityState !== "visible") return;
      busy.current = true;
      try {
        const next = await orderStamp(token);
        if (!stopped && next && next !== current.current) {
          current.current = next;
          router.refresh();
        }
      } catch {
        // sem internet por um instante: tenta de novo na próxima volta
      } finally {
        busy.current = false;
      }
    };
    const id = window.setInterval(check, seconds * 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    // página restaurada do cache (voltar no navegador / reabrir o app): atualiza tudo
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) router.refresh();
      else void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("online", onVisible);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      stopped = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("online", onVisible);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [router, token, seconds]);

  return null;
}
