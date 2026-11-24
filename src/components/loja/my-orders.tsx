"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { KeyRound, Loader2, ShoppingBag } from "lucide-react";
import { loginMyOrders, myOrders } from "@/app/loja/[slug]/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { loadOrderTokens, rememberOrders, splitOrders, type OrderSummary } from "@/lib/my-orders";
import { formatPhone } from "@/lib/utils";
import { OrderSummaryCard } from "./order-summary-card";

/** Tela "Meus pedidos": pedidos deste aparelho + entrar com celular e senha. */
export function MyOrders({ storeId, slug }: { storeId: string; slug: string }) {
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    // sem pedidos guardados, a action devolve [] sem ir ao banco
    myOrders(storeId, loadOrderTokens(slug))
      .then(setOrders)
      .catch(() => setOrders([]));
  }, [slug, storeId]);

  const login = () => {
    setError(null);
    startTransition(async () => {
      const r = await loginMyOrders(storeId, phone, pin);
      if (!r.ok) return setError(r.message);
      rememberOrders(slug, r.orders.map((o) => o.token));
      setOrders((prev) => {
        const byToken = new Map([...(prev ?? []), ...r.orders].map((o) => [o.token, o]));
        return [...byToken.values()];
      });
      setPin("");
      setShowLogin(false);
    });
  };

  if (orders === null) {
    return (
      <div className="flex justify-center py-16 text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  const { active, past } = splitOrders(orders);
  const loginOpen = showLogin || orders.length === 0;

  return (
    <div className="grid gap-6">
      {active.length ? (
        <section className="grid gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Em andamento</h2>
          {active.map((o) => (
            <OrderSummaryCard key={o.token} slug={slug} order={o} />
          ))}
        </section>
      ) : null}

      {past.length ? (
        <section className="grid gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Pedidos anteriores</h2>
          {past.map((o) => (
            <OrderSummaryCard key={o.token} slug={slug} order={o} />
          ))}
        </section>
      ) : null}

      {orders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 px-5 py-8 text-center">
          <ShoppingBag className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-2 font-semibold">Nenhum pedido neste aparelho</p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
            Os pedidos que você fizer aqui aparecem nesta tela. Pediu em outro aparelho? Entre com seu celular e senha.
          </p>
        </div>
      ) : null}

      {loginOpen ? (
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <KeyRound className="size-4 text-brand" /> Ver pedidos de outro aparelho
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Use o celular do pedido e a senha de 4 números que você criou.</p>
          <form
            className="mt-4 grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              login();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Celular" htmlFor="login-phone">
                <Input
                  id="login-phone"
                  type="tel"
                  autoComplete="tel-national"
                  placeholder="(11) 99999-9999"
                  value={phone}
                  onChange={(e) => setPhone(formatPhone(e.target.value))}
                />
              </Field>
              <Field label="Senha" htmlFor="login-pin">
                <Input
                  id="login-pin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="current-password"
                  maxLength={4}
                  placeholder="••••"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                />
              </Field>
            </div>
            {error ? <Alert tone="error">{error}</Alert> : null}
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null} Ver meus pedidos
            </Button>
            <p className="text-xs text-muted-foreground">
              Ainda não tem senha? Abra um pedido seu no aparelho onde pediu e toque em “Criar senha”.
            </p>
          </form>
        </section>
      ) : (
        <button onClick={() => setShowLogin(true)} className="mx-auto cursor-pointer text-sm font-semibold text-brand hover:underline">
          Pediu em outro aparelho? Entrar com celular e senha
        </button>
      )}

      <Link href={`/loja/${slug}`} className="mx-auto text-sm font-medium text-muted-foreground hover:text-brand">
        Voltar ao cardápio
      </Link>
    </div>
  );
}
