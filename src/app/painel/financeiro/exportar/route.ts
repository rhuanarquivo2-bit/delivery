import { csvCell, csvMoney, resolvePeriod } from "@/lib/finance";
import { PAYMENT_LABELS } from "@/lib/pricing";
import { STATUS_LABELS } from "@/lib/order-status";
import { getMyStore } from "@/lib/stores";
import { createClient } from "@/lib/supabase/server";
import type { Order } from "@/lib/types";

const HEAD = [
  "Pedido", "Data", "Hora", "Cliente", "Telefone", "Tipo", "Bairro", "Situação", "Pagamento", "Pago online",
  "Produtos", "Entrega", "Desconto", "Cupom", "Total", "Troco para",
];

/** Planilha (CSV para Excel/Google Planilhas) com todos os pedidos do período. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const period = resolvePeriod({ de: url.searchParams.get("de") ?? "", ate: url.searchParams.get("ate") ?? "" });
  const mine = await getMyStore();
  if (!mine) return new Response("Sem loja", { status: 403 });

  const start = new Date(`${period.from}T00:00:00-03:00`).toISOString();
  const end = new Date(new Date(`${period.to}T00:00:00-03:00`).getTime() + 86400000).toISOString();
  const supabase = await createClient();

  const rows: Order[] = [];
  for (let page = 0; page < 50; page++) {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("store_id", mine.store.id)
      .in("payment_status", ["on_delivery", "paid"])
      .gte("created_at", start)
      .lt("created_at", end)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(page * 1000, page * 1000 + 999);
    if (error) return new Response("Erro ao gerar a planilha", { status: 500 });
    rows.push(...((data ?? []) as Order[]));
    if (!data || data.length < 1000) break;
  }

  const date = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" });
  const time = new Intl.DateTimeFormat("pt-BR", { timeStyle: "short", timeZone: "America/Sao_Paulo" });
  const lines = [HEAD.join(";")];
  for (const o of rows) {
    const at = new Date(o.created_at);
    lines.push(
      [
        o.number,
        date.format(at),
        time.format(at),
        o.customer_name,
        o.customer_phone,
        o.fulfillment === "delivery" ? "Entrega" : "Retirada",
        o.address_district ?? "",
        STATUS_LABELS[o.status],
        PAYMENT_LABELS[o.payment_method],
        o.payment_status === "paid" ? "Sim" : "Não",
        csvMoney(o.subtotal_cents),
        csvMoney(o.delivery_fee_cents),
        csvMoney(o.discount_cents),
        o.coupon_code ?? "",
        csvMoney(o.total_cents),
        o.change_for_cents ? csvMoney(o.change_for_cents) : "",
      ]
        .map(csvCell)
        .join(";"),
    );
  }

  const name = `pedidos-${mine.store.slug}-${period.from}-a-${period.to}.csv`;
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
