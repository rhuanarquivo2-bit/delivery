"use client";

import { useActionState, useState } from "react";
import { addReward, type FormState, saveLoyaltySettings } from "@/app/painel/fidelidade/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { keepValuesOnSubmit } from "@/lib/use-keep-values-submit";

function Feedback({ state }: { state: FormState }) {
  if (!state.message) return null;
  return <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>;
}

const money = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

export function LoyaltySettingsForm({
  enabled,
  centsPerPoint,
  welcomePoints,
  expiryDays,
}: {
  enabled: boolean;
  centsPerPoint: number;
  welcomePoints: number;
  expiryDays: number;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveLoyaltySettings, {});
  return (
    <form onSubmit={keepValuesOnSubmit(action)} className="grid gap-4">
      <Feedback state={state} />
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-4">
        <input
          type="checkbox"
          name="loyalty_enabled"
          defaultChecked={enabled}
          className="mt-0.5 size-4 shrink-0 accent-[var(--brand)]"
        />
        <span>
          <span className="block text-sm font-semibold">Programa de fidelidade ligado</span>
          <span className="block text-sm text-muted-foreground">
            O cliente ganha pontos quando o pedido é entregue e troca por recompensas na hora de finalizar.
          </span>
        </span>
      </label>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Gasto para ganhar 1 ponto (R$)" htmlFor="money_per_point" hint="Conta o valor dos produtos, sem a entrega.">
          <Input id="money_per_point" name="money_per_point" inputMode="decimal" defaultValue={money(centsPerPoint)} />
        </Field>
        <Field label="Pontos de boas-vindas" htmlFor="loyalty_welcome_points" hint="Cliente novo ganha no primeiro pedido entregue.">
          <Input id="loyalty_welcome_points" name="loyalty_welcome_points" inputMode="numeric" defaultValue={welcomePoints} />
        </Field>
        <Field label="Validade dos pontos (dias)" htmlFor="loyalty_expiry_days" hint="Contada a partir de cada pedido entregue.">
          <Input id="loyalty_expiry_days" name="loyalty_expiry_days" inputMode="numeric" defaultValue={expiryDays} />
        </Field>
      </div>
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Salvando..." : "Salvar programa"}
      </Button>
    </form>
  );
}

export function RewardForm({ products }: { products: { id: string; name: string; category: string }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addReward, {});
  const [kind, setKind] = useState<"product" | "percent">("product");
  return (
    <form action={action} className="grid gap-4 rounded-xl border border-dashed border-border p-4">
      <p className="text-sm font-semibold">Nova recompensa</p>
      <Feedback state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome" htmlFor="reward_name">
          <Input id="reward_name" name="name" placeholder="Ex.: Batata frita grátis" maxLength={60} />
        </Field>
        <Field label="Custa quantos pontos" htmlFor="points_cost">
          <Input id="points_cost" name="points_cost" inputMode="numeric" placeholder="100" />
        </Field>
        <Field label="Tipo" htmlFor="kind">
          <select
            id="kind"
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as "product" | "percent")}
            className="h-11 rounded-xl border border-border bg-background px-3 text-sm"
          >
            <option value="product">Produto grátis</option>
            <option value="percent">Desconto em %</option>
          </select>
        </Field>
        {kind === "product" ? (
          <Field label="Produto grátis" htmlFor="product_id">
            <select id="product_id" name="product_id" className="h-11 rounded-xl border border-border bg-background px-3 text-sm">
              <option value="">Escolha</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.category})
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label="Desconto (%)" htmlFor="percent">
            <Input id="percent" name="percent" inputMode="numeric" placeholder="10" />
          </Field>
        )}
      </div>
      <Button type="submit" variant="outline" disabled={pending} className="w-fit">
        {pending ? "Salvando..." : "Adicionar recompensa"}
      </Button>
    </form>
  );
}
