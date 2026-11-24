"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { saveCourier, type FormState } from "@/app/painel/motoboys/actions";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import type { Courier, CourierFeeMode } from "@/lib/types";
import { keepValuesOnSubmit } from "@/lib/use-keep-values-submit";
import { cn, formatBRL } from "@/lib/utils";

const money = (cents: number | null | undefined) => (cents ? formatBRL(cents).replace(/^R\$\s?/, "") : "");

function formatPhone(value: string) {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

const MODES: [CourierFeeMode, string, string][] = [
  ["fixed", "Valor fixo por entrega", "Ex.: R$ 7,00 em toda entrega"],
  ["zone_fee", "Taxa do bairro", "Ganha a taxa de entrega do bairro"],
];

export function CourierForm({ courier }: { courier: Courier | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveCourier, {});
  const [mode, setMode] = useState<CourierFeeMode>(courier?.fee_mode ?? "fixed");
  const [phone, setPhone] = useState(formatPhone(courier?.phone ?? ""));

  return (
    <form onSubmit={keepValuesOnSubmit(action)} className="grid gap-6">
      <input type="hidden" name="id" value={courier?.id ?? ""} />
      {state.message ? <Alert tone="error">{state.message}</Alert> : null}

      <Card>
        <CardContent className="grid gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome" htmlFor="name">
              <Input id="name" name="name" required maxLength={60} defaultValue={courier?.name} />
            </Field>
            <Field label="Celular (WhatsApp)" htmlFor="phone" hint="Para mandar o link do site dele.">
              <Input
                id="phone"
                name="phone"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(formatPhone(e.target.value))}
                placeholder="(11) 99999-0000"
              />
            </Field>
          </div>
          <Field label="Chave Pix (opcional)" htmlFor="pix_key" hint="Para você pagar o acerto.">
            <Input id="pix_key" name="pix_key" maxLength={120} defaultValue={courier?.pix_key ?? ""} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quanto ele ganha</CardTitle>
          <CardDescription>
            A taxa de cada entrega fica gravada quando o pedido é passado para ele. Mudar aqui só vale para os próximos.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid gap-2 sm:grid-cols-2">
            {MODES.map(([value, label, hint]) => (
              <label
                key={value}
                className={cn(
                  "grid cursor-pointer gap-0.5 rounded-xl border px-4 py-3 text-sm",
                  mode === value ? "border-brand bg-brand/5 ring-2 ring-brand/20" : "border-border hover:bg-muted",
                )}
              >
                <input
                  type="radio"
                  name="fee_mode"
                  value={value}
                  checked={mode === value}
                  onChange={() => setMode(value)}
                  className="sr-only"
                />
                <span className="font-semibold">{label}</span>
                <span className="text-muted-foreground">{hint}</span>
              </label>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {mode === "fixed" ? (
              <Field label="Valor por entrega (R$)" htmlFor="fee">
                <Input id="fee" name="fee" inputMode="decimal" placeholder="7,00" defaultValue={money(courier?.fee_cents)} />
              </Field>
            ) : null}
            <Field label="Diária (R$, opcional)" htmlFor="daily_rate" hint="Entra nos dias em que ele fizer pelo menos uma entrega.">
              <Input
                id="daily_rate"
                name="daily_rate"
                inputMode="decimal"
                placeholder="0,00"
                defaultValue={money(courier?.daily_rate_cents)}
              />
            </Field>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <input type="checkbox" name="active" defaultChecked={courier?.active ?? true} className="size-4 accent-[var(--brand)]" />
            Ativo (aparece na lista para levar pedidos)
          </label>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando..." : "Salvar motoboy"}
        </Button>
        <Link href="/painel/motoboys" className={buttonVariants({ variant: "ghost" })}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
