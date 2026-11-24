import { type CustomerRow } from "@/lib/customers";
import { csvCell, csvMoney } from "@/lib/finance";
import { getMyStore } from "@/lib/stores";
import { createClient } from "@/lib/supabase/server";

const HEAD = ["Cliente", "Celular", "Bairro", "Pedidos", "Cancelados", "Total gasto", "Primeiro pedido", "Último pedido"];

/** Planilha (CSV para Excel/Google Planilhas) com todos os clientes da loja. */
export async function GET() {
  const mine = await getMyStore();
  if (!mine) return new Response("Sem loja", { status: 403 });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("customer_report", { p_store_id: mine.store.id });
  if (error) return new Response("Erro ao gerar a planilha", { status: 500 });

  const date = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" });
  const lines = [HEAD.join(";")];
  for (const c of (data ?? []) as CustomerRow[]) {
    lines.push(
      [
        c.name,
        c.phone,
        c.district ?? "",
        c.orders,
        c.cancelled,
        csvMoney(Number(c.total_cents)),
        date.format(new Date(c.first_order_at)),
        date.format(new Date(c.last_order_at)),
      ]
        .map(csvCell)
        .join(";"),
    );
  }
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="clientes-${mine.store.slug}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
