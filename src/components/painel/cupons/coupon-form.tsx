"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { saveCoupon, type FormState } from "@/app/painel/cupons/actions";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import type { Coupon, CouponKind } from "@/lib/types";
import { keepValuesOnSubmit } from "@/lib/use-keep-values-submit";
import { cn, formatBRL } from "@/lib/utils";

const money = (cents: number | null | undefined) => (cents ? formatBRL(cents).replace(/^R\$\s?/, "") : "");

/** Data salva (timestamptz) -> AAAA-MM-DD no horário de Brasília. */
function localDate(iso: string | null | undefined, endExclusive = false) {
  if (!iso) return "";
  const d = new Date(iso);
  if (endExclusive) d.setTime(d.getTime() - 1);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

const KINDS: [CouponKind, string][] = [
  ["percent", "Porcentagem"],
  ["fixed", "Valor em R$"],
  ["free_delivery", "Entrega grátis"],
];

export function CouponForm({ coupon }: { coupon: Coupon | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveCoupon, {});
  const [kind, setKind] = useState<CouponKind>(coupon?.kind ?? "percent");

  return (
    <form onSubmit={keepValuesOnSubmit(action)} className="grid gap-6">
      <input type="hidden" name="id" value={coupon?.id ?? ""} />
      {state.message ? <Alert tone="error">{state.message}</Alert> : null}

      <Card>
        <CardContent className="grid gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Código" htmlFor="code" hint="O que o cliente digita no checkout, ex.: BEMVINDO10.">
              <Input
                id="code"
                name="code"
                required
                maxLength={20}
                defaultValue={coupon?.code}
                className="uppercase"
                onInput={(e) => {
                  e.currentTarget.value = e.currentTarget.value.toUpperCase().replace(/\s/g, "");
                }}
              />
            </Field>
            <Field label="Descrição (opcional)" htmlFor="description" hint="Aparece para o cliente quando ele aplica o cupom.">
              <Input id="description" name="description" maxLength={120} defaultValue={coupon?.description ?? ""} />
            </Field>
          </div>

          <Field label="Tipo de cupom">
            <div className="grid gap-2 sm:grid-cols-3">
              {KINDS.map(([value, label]) => (
                <label
                  key={value}
                  className={cn(
                    "flex h-11 cursor-pointer items-center justify-center rounded-xl border text-sm font-medium",
                    kind === value ? "border-brand bg-brand/5 text-brand" : "border-border",
                  )}
                >
                  <input
                    type="radio"
                    name="kind"
                    value={value}
                    checked={kind === value}
                    onChange={() => setKind(value)}
                    className="sr-only"
                  />
                  {label}
                </label>
              ))}
            </div>
          </Field>

          {kind !== "free_delivery" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={kind === "percent" ? "Desconto (%)" : "Desconto (R$)"} htmlFor="value">
                <Input
                  id="value"
                  name="value"
                  inputMode="decimal"
                  required
                  key={kind}
                  placeholder={kind === "percent" ? "Ex.: 10" : "Ex.: 15,00"}
                  defaultValue={
                    kind === coupon?.kind ? (kind === "percent" ? String(coupon.value) : money(coupon.value)) : ""
                  }
                />
              </Field>
              {kind === "percent" ? (
                <Field label="Desconto máximo em R$ (opcional)" htmlFor="max_discount" hint="Ex.: 10% até R$ 20,00.">
                  <Input
                    id="max_discount"
                    name="max_discount"
                    inputMode="decimal"
                    defaultValue={money(coupon?.max_discount_cents)}
                  />
                </Field>
              ) : null}
            </div>
          ) : (
            <p className="rounded-xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
              O cliente não paga a taxa de entrega do bairro. Não vale para retirada na loja.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-5">
          <div>
            <h2 className="font-semibold">Regras</h2>
            <p className="text-sm text-muted-foreground">Deixe em branco o que não quiser limitar.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Pedido mínimo (R$)" htmlFor="min_order">
              <Input id="min_order" name="min_order" inputMode="decimal" defaultValue={money(coupon?.min_order_cents)} />
            </Field>
            <Field label="Limite total de usos" htmlFor="usage_limit" hint="Ex.: os 50 primeiros.">
              <Input
                id="usage_limit"
                name="usage_limit"
                inputMode="numeric"
                defaultValue={coupon?.usage_limit ?? ""}
              />
            </Field>
            <Field label="Usos por cliente" htmlFor="per_customer_limit" hint="Conta pelo celular.">
              <Input
                id="per_customer_limit"
                name="per_customer_limit"
                inputMode="numeric"
                defaultValue={coupon?.per_customer_limit ?? ""}
              />
            </Field>
            <Field label="Começa em" htmlFor="starts_on">
              <Input id="starts_on" name="starts_on" type="date" defaultValue={localDate(coupon?.starts_at)} />
            </Field>
            <Field label="Vale até (inclusive)" htmlFor="ends_on">
              <Input id="ends_on" name="ends_on" type="date" defaultValue={localDate(coupon?.ends_at, true)} />
            </Field>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              name="first_order_only"
              defaultChecked={coupon?.first_order_only ?? false}
              className="size-4 accent-[var(--brand)]"
            />
            Só para o primeiro pedido do cliente na loja
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              name="active"
              defaultChecked={coupon?.active ?? true}
              className="size-4 accent-[var(--brand)]"
            />
            Cupom ativo
          </label>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando..." : "Salvar cupom"}
        </Button>
        <Link href="/painel/cupons" className={buttonVariants({ variant: "ghost" })}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
