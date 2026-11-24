"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight, ReceiptText } from "lucide-react";
import { myOrders } from "@/app/loja/[slug]/actions";
import { loadOrderTokens, splitOrders, type OrderSummary } from "@/lib/my-orders";
import { orderStatusText } from "./order-summary-card";

/** Cardápio: aviso do pedido em andamento feito neste aparelho. */
export function ActiveOrderBanner({ storeId, slug }: { storeId: string; slug: string }) {
  const [active, setActive] = useState<OrderSummary | null>(null);
  useEffect(() => {
    const tokens = loadOrderTokens(slug).slice(0, 10);
    if (!tokens.length) return;
    myOrders(storeId, tokens)
      .then((orders) => setActive(splitOrders(orders).active[0] ?? null))
      .catch(() => {});
  }, [slug, storeId]);
  if (!active) return null;
  return (
    <Link
      href={`/loja/${slug}/pedido/${active.token}`}
      className="mt-4 flex items-center gap-3 rounded-2xl border border-brand/30 bg-brand/5 px-4 py-3 text-sm hover:border-brand"
    >
      <span className="relative flex size-2.5">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-60" />
        <span className="relative inline-flex size-2.5 rounded-full bg-brand" />
      </span>
      <span className="min-w-0 flex-1">
        <strong>Pedido #{active.number}</strong> · {orderStatusText(active)}
      </span>
      <span className="flex items-center gap-1 font-semibold text-brand">
        Acompanhar <ChevronRight className="size-4" />
      </span>
    </Link>
  );
}

/** Botão "Meus pedidos" no topo do cardápio. */
export function MyOrdersLink({ slug }: { slug: string }) {
  return (
    <Link
      href={`/loja/${slug}/pedidos`}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:border-brand hover:text-brand"
    >
      <ReceiptText className="size-3.5" /> Meus pedidos
    </Link>
  );
}
