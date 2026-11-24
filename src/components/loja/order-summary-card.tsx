import Link from "next/link";
import { CheckCircle2, ChevronRight, Clock, XCircle } from "lucide-react";
import { isActiveOrder, type OrderSummary } from "@/lib/my-orders";
import { customerStatusLabel } from "@/lib/order-status";
import { cn, formatBRL } from "@/lib/utils";

const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

export function orderStatusText(o: OrderSummary) {
  if (o.payment_status === "awaiting") return "Aguardando pagamento";
  if (o.payment_status === "expired") return "Pix não pago";
  return customerStatusLabel(o.status, o.fulfillment);
}

/** Cartão de um pedido na lista "Meus pedidos". */
export function OrderSummaryCard({ slug, order }: { slug: string; order: OrderSummary }) {
  const active = isActiveOrder(order);
  const cancelled = order.status === "cancelled" || order.payment_status === "expired";
  const Icon = cancelled ? XCircle : active ? Clock : CheckCircle2;
  return (
    <Link
      href={`/loja/${slug}/pedido/${order.token}`}
      className={cn(
        "flex items-center gap-3 rounded-2xl border bg-card p-4 transition hover:border-brand/40",
        active ? "border-brand/40 shadow-sm" : "border-border",
      )}
    >
      <span
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-full",
          cancelled ? "bg-red-50 text-red-600" : active ? "bg-brand/10 text-brand" : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="whitespace-nowrap font-semibold">Pedido #{order.number}</span>
          <span
            className={cn(
              "whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold",
              cancelled ? "bg-red-50 text-red-700" : active ? "bg-brand/10 text-brand" : "bg-muted text-muted-foreground",
            )}
          >
            {orderStatusText(order)}
          </span>
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {dateFmt.format(new Date(order.created_at))} · {order.fulfillment === "delivery" ? "Entrega" : "Retirada"}
        </span>
        {order.items.length ? (
          <span className="mt-1 block truncate text-sm text-muted-foreground">{order.items.join(", ")}</span>
        ) : null}
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-sm font-semibold">{formatBRL(order.total_cents)}</span>
        <ChevronRight className="ml-auto mt-1 size-4 text-muted-foreground" />
      </span>
    </Link>
  );
}
