"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { savePromotion, type FormState } from "@/app/painel/promocoes/actions";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { WEEKDAYS } from "@/lib/hours";
import type { Category, Promotion } from "@/lib/types";
import { keepValuesOnSubmit } from "@/lib/use-keep-values-submit";
import { cn, formatBRL } from "@/lib/utils";

const selectClass = "h-11 w-full rounded-xl border border-border bg-background px-3 text-sm";

export function PromotionForm({ promotion, categories }: { promotion: Promotion | null; categories: Category[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(savePromotion, {});
  const [kind, setKind] = useState(promotion?.kind ?? "percent");
  const [days, setDays] = useState<number[]>(promotion?.weekdays ?? []);

  const target = promotion?.product_id ? `p:${promotion.product_id}` : promotion?.category_id ? `c:${promotion.category_id}` : "";
  const defaultValue = promotion
    ? promotion.kind === "percent"
      ? String(promotion.value)
      : formatBRL(promotion.value).replace(/^R\$\s?/, "")
    : "";

  return (
    <form onSubmit={keepValuesOnSubmit(action)} className="grid gap-6">
      <input type="hidden" name="id" value={promotion?.id ?? ""} />
      {state.message ? <Alert tone="error">{state.message}</Alert> : null}

      <Card>
        <CardContent className="grid gap-5">
          <Field label="Nome da promoção" htmlFor="name" hint="Aparece no site junto do preço, ex.: “Terça do hambúrguer”.">
            <Input id="name" name="name" maxLength={60} required defaultValue={promotion?.name} />
          </Field>

          <Field label="Vale para" htmlFor="target">
            <select id="target" name="target" required defaultValue={target} className={selectClass}>
              <option value="" disabled>
                Escolha um produto ou uma categoria inteira
              </option>
              {categories.map((c) => (
                <optgroup key={c.id} label={c.name}>
                  <option value={`c:${c.id}`}>Toda a categoria {c.name}</option>
                  {c.products.map((p) => (
                    <option key={p.id} value={`p:${p.id}`}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tipo de desconto">
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["percent", "Porcentagem"],
                    ["fixed", "Valor em R$"],
                  ] as const
                ).map(([value, label]) => (
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
            <Field
              label={kind === "percent" ? "Desconto (%)" : "Desconto (R$)"}
              htmlFor="value"
              hint={kind === "percent" ? "De 1 a 90%." : "Sai de cada unidade. Em pizzas, de cada sabor."}
            >
              <Input
                id="value"
                name="value"
                inputMode="decimal"
                required
                key={kind}
                defaultValue={kind === promotion?.kind ? defaultValue : ""}
                placeholder={kind === "percent" ? "Ex.: 20" : "Ex.: 5,00"}
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-5">
          <div>
            <h2 className="font-semibold">Quando vale</h2>
            <p className="text-sm text-muted-foreground">Deixe em branco para valer sempre.</p>
          </div>

          <Field label="Dias da semana" hint="Nenhum dia marcado = todos os dias.">
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((day, i) => {
                const checked = days.includes(i);
                return (
                  <label
                    key={day}
                    className={cn(
                      "flex h-10 min-w-14 cursor-pointer items-center justify-center rounded-xl border px-3 text-sm font-medium",
                      checked ? "border-brand bg-brand/5 text-brand" : "border-border",
                    )}
                  >
                    <input
                      type="checkbox"
                      name="weekdays"
                      value={i}
                      checked={checked}
                      onChange={() => setDays((d) => (checked ? d.filter((x) => x !== i) : [...d, i]))}
                      className="sr-only"
                    />
                    {day.slice(0, 3)}
                  </label>
                );
              })}
            </div>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Das (horário)" htmlFor="start_time" hint="Ex.: happy hour das 18:00 às 20:00.">
              <Input id="start_time" name="start_time" type="time" defaultValue={promotion?.start_time?.slice(0, 5)} />
            </Field>
            <Field label="Até (horário)" htmlFor="end_time">
              <Input id="end_time" name="end_time" type="time" defaultValue={promotion?.end_time?.slice(0, 5)} />
            </Field>
            <Field label="Começa em" htmlFor="starts_on">
              <Input id="starts_on" name="starts_on" type="date" defaultValue={promotion?.starts_on ?? ""} />
            </Field>
            <Field label="Termina em" htmlFor="ends_on">
              <Input id="ends_on" name="ends_on" type="date" defaultValue={promotion?.ends_on ?? ""} />
            </Field>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              name="active"
              defaultChecked={promotion?.active ?? true}
              className="size-4 accent-[var(--brand)]"
            />
            Promoção ativa
          </label>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando..." : "Salvar promoção"}
        </Button>
        <Link href="/painel/promocoes" className={buttonVariants({ variant: "ghost" })}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
