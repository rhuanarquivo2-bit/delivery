"use client";

import dynamic from "next/dynamic";

/** A tela da cozinha lê os ajustes do aparelho (localStorage), então só roda no navegador. */
export const KitchenScreen = dynamic(() => import("./kitchen-display").then((m) => m.KitchenDisplay), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh items-center justify-center bg-zinc-950 text-zinc-400">Abrindo a cozinha...</div>
  ),
});
