"use client";

import { useEffect } from "react";
import { rememberOrders } from "@/lib/my-orders";

/** Quem abre o link do pedido passa a ver esse pedido em "Meus pedidos" neste aparelho. */
export function RememberOrder({ slug, token }: { slug: string; token: string }) {
  useEffect(() => {
    rememberOrders(slug, [token]);
  }, [slug, token]);
  return null;
}
