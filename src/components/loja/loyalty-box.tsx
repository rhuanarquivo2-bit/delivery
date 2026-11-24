"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, Gift } from "lucide-react";
import { loyaltyStatus } from "@/app/loja/[slug]/actions";
import { type LoyaltyReward, type LoyaltyStatus, pointsFor, pointsRule } from "@/lib/loyalty";
import { loadOrderTokens } from "@/lib/my-orders";
import { cn } from "@/lib/utils";

/** Checkout: saldo de pontos e troca por recompensa com um toque. */
export function LoyaltyBox({
  storeId,
  slug,
  phoneDigits,
  subtotalCents,
  couponDiscountCents,
  selected,
  onSelect,
}: {
  storeId: string;
  slug: string;
  phoneDigits: string;
  subtotalCents: number;
  couponDiscountCents: number;
  selected: LoyaltyReward | null;
  onSelect: (reward: LoyaltyReward | null, tokens: string[]) => void;
}) {
  const [status, setStatus] = useState<LoyaltyStatus | null>(null);
  const [tokens, setTokens] = useState<string[]>([]);
  const phone = phoneDigits.length >= 10 ? phoneDigits : "";

  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(() => {
      const list = loadOrderTokens(slug);
      loyaltyStatus(storeId, phone || null, list)
        .then((s) => {
          if (cancelled) return;
          setTokens(list);
          setStatus(s);
        })
        .catch(() => {});
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [storeId, slug, phone]);

  // saldo mudou ou o celular é outro: solta a recompensa escolhida
  const balance = status?.enabled && status.verified ? (status.points?.balance ?? 0) : null;
  useEffect(() => {
    if (selected && (balance === null || balance < selected.points_cost)) onSelect(null, []);
  }, [balance, selected, onSelect]);

  if (!status?.enabled) return null;
  const willEarn = pointsFor(subtotalCents, couponDiscountCents, status.cents_per_point);

  return (
    <section className="rounded-2xl border border-border bg-card p-5" aria-labelledby="fidelidade-titulo">
      <h2 id="fidelidade-titulo" className="flex items-center gap-2 font-semibold">
        <Gift className="size-4 text-brand" /> Programa de fidelidade
      </h2>
      <p className="text-sm text-muted-foreground">
        {pointsRule(status.cents_per_point)}.{" "}
        {willEarn > 0 ? `Este pedido vale ${willEarn} ${willEarn === 1 ? "ponto" : "pontos"} quando for entregue.` : ""}
      </p>

      {balance === null ? (
        <p className="mt-3 text-sm">
          {status.welcome_points > 0 ? `Cliente novo ganha ${status.welcome_points} pontos de boas-vindas. ` : ""}
          Já tem pontos?{" "}
          <Link href={`/loja/${slug}/pedidos`} className="font-semibold text-brand hover:underline">
            Entre em Meus pedidos
          </Link>{" "}
          para usar.
        </p>
      ) : (
        <>
          <p className="mt-3 text-sm">
            Você tem <strong className="text-brand">{balance} pontos</strong>
            {status.points?.expiring_at && status.points.expiring_points ? (
              <span className="text-muted-foreground">
                {" "}
                · {status.points.expiring_points} vencem em{" "}
                {new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }).format(
                  new Date(status.points.expiring_at),
                )}
              </span>
            ) : null}
          </p>
          {status.rewards.length ? (
            <ul className="mt-3 grid gap-2">
              {status.rewards.map((r) => {
                const can = balance >= r.points_cost;
                const on = selected?.id === r.id;
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      disabled={!can}
                      aria-pressed={on}
                      onClick={() => onSelect(on ? null : r, tokens)}
                      className={cn(
                        "flex w-full cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition disabled:cursor-not-allowed",
                        on ? "border-brand bg-brand/5 ring-2 ring-brand/20" : "border-border hover:border-brand/40",
                        !can && "opacity-60",
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{r.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {r.points_cost} pontos{can ? "" : ` · faltam ${r.points_cost - balance}`}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "flex h-8 shrink-0 items-center gap-1 rounded-lg px-3 text-xs font-semibold",
                          on ? "bg-brand text-brand-foreground" : can ? "bg-muted" : "",
                        )}
                      >
                        {on ? (
                          <>
                            <Check className="size-3.5" /> Usando
                          </>
                        ) : can ? (
                          "Usar"
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </>
      )}
    </section>
  );
}
