"use client";

import { useEffect, useState } from "react";
import { Gift } from "lucide-react";
import { loyaltyStatus } from "@/app/loja/[slug]/actions";
import { type LoyaltyStatus, nextReward, pointsRule } from "@/lib/loyalty";

/** "Meus pedidos": saldo de pontos e quanto falta para a próxima recompensa. */
export function LoyaltyCard({ storeId, tokens }: { storeId: string; tokens: string[] }) {
  const [status, setStatus] = useState<LoyaltyStatus | null>(null);
  const key = tokens.join(",");
  useEffect(() => {
    let cancelled = false;
    loyaltyStatus(storeId, null, key ? key.split(",") : [])
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [storeId, key]);

  if (!status?.enabled) return null;
  const balance = status.verified ? (status.points?.balance ?? 0) : null;
  const next = balance !== null ? nextReward(status.rewards, balance) : null;
  const ready = balance !== null ? status.rewards.filter((r) => r.points_cost <= balance) : [];
  const progress = next && balance !== null ? Math.min(100, Math.round((balance / next.points_cost) * 100)) : 100;

  return (
    <section className="rounded-2xl border border-brand/30 bg-brand/5 p-5" aria-label="Seus pontos">
      <div className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground">
          <Gift className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          {balance !== null ? (
            <>
              <p className="text-2xl font-bold leading-none">
                {balance} <span className="text-base font-semibold">pontos</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Celular final {status.phone_end}
                {status.points?.expiring_at && status.points.expiring_points
                  ? ` · ${status.points.expiring_points} vencem em ${new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(status.points.expiring_at))}`
                  : ""}
              </p>
            </>
          ) : (
            <p className="font-semibold">Programa de fidelidade</p>
          )}
        </div>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        {pointsRule(status.cents_per_point)}. Os pontos valem por {status.expiry_days} dias.
      </p>
      {next && balance !== null ? (
        <div className="mt-3">
          <div className="h-2 overflow-hidden rounded-full bg-background">
            <div className="h-full rounded-full bg-brand" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-1.5 text-sm">
            Faltam <strong>{next.points_cost - balance} pontos</strong> para {next.name}.
          </p>
        </div>
      ) : null}
      {ready.length ? (
        <p className="mt-2 text-sm font-semibold text-emerald-700">
          Você já pode trocar: {ready.map((r) => r.name).join(", ")}. Escolha na hora de finalizar o pedido.
        </p>
      ) : null}
      {balance === null && status.rewards.length ? (
        <ul className="mt-2 grid gap-1 text-sm">
          {status.rewards.map((r) => (
            <li key={r.id} className="flex justify-between">
              <span>{r.name}</span>
              <span className="text-muted-foreground">{r.points_cost} pontos</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
