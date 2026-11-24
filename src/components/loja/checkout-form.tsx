"use client";

import dynamic from "next/dynamic";

/** O carrinho fica no navegador, então o checkout só é montado no cliente. */
export const CheckoutForm = dynamic(() => import("./checkout-form-inner"), {
  ssr: false,
  loading: () => <div className="mx-auto max-w-2xl px-4 py-16 text-center text-muted-foreground">Carregando…</div>,
});
