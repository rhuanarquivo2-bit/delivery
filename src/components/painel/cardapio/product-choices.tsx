"use client";

import { useRef } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { OptionGroup } from "@/lib/types";
import { cn } from "@/lib/utils";

export type ChoiceOptionRow = { key: number; id: string; name: string; price: string; active: boolean };
export type ChoiceGroupRow = {
  key: number;
  id: string;
  name: string;
  min_select: number;
  max_select: number;
  options: ChoiceOptionRow[];
};

const toInput = (cents: number) => (cents ? (cents / 100).toFixed(2).replace(".", ",") : "");

export function toChoiceRows(groups: OptionGroup[] | undefined): ChoiceGroupRow[] {
  return (groups ?? []).map((g, i) => ({
    key: 100 + i,
    id: g.id,
    name: g.name,
    min_select: g.min_select,
    max_select: g.max_select,
    options: g.options.map((o, j) => ({
      key: 500 + i * 100 + j,
      id: o.id,
      name: o.name,
      price: toInput(o.price_cents),
      active: o.active,
    })),
  }));
}

export function choicesPayload(groups: ChoiceGroupRow[]) {
  return groups.map(({ id, name, min_select, max_select, options }) => ({
    id,
    name,
    min_select,
    max_select,
    options: options.map(({ id, name, price, active }) => ({ id, name, price: price || "0", active })),
  }));
}

/**
 * Escolhas só deste produto. O caso típico: "Refrigerante Lata" com o sabor obrigatório
 * (Coca-Cola, Guaraná, Fanta...). Sabor que acabou é só desligar.
 */
export function ProductChoices({
  groups,
  onChange,
}: {
  groups: ChoiceGroupRow[];
  onChange: (next: ChoiceGroupRow[]) => void;
}) {
  const key = useRef(10_000);
  const next = () => key.current++;
  const emptyOption = (): ChoiceOptionRow => ({ key: next(), id: "", name: "", price: "", active: true });

  const updateGroup = (k: number, patch: Partial<ChoiceGroupRow>) =>
    onChange(groups.map((g) => (g.key === k ? { ...g, ...patch } : g)));
  const updateOption = (gk: number, ok: number, patch: Partial<ChoiceOptionRow>) =>
    onChange(
      groups.map((g) =>
        g.key === gk ? { ...g, options: g.options.map((o) => (o.key === ok ? { ...o, ...patch } : o)) } : g,
      ),
    );
  const addGroup = (name: string, required: boolean) =>
    onChange([
      ...groups,
      {
        key: next(),
        id: "",
        name,
        min_select: required ? 1 : 0,
        max_select: 1,
        options: [emptyOption(), emptyOption()],
      },
    ]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sabores e opções deste produto</CardTitle>
        <CardDescription>
          Para cadastrar um item só com vários sabores, como “Refrigerante Lata” (Coca-Cola, Guaraná, Fanta...) ou
          “Suco natural” (laranja, limão...). O cliente escolhe o sabor ao tocar no produto. Quando um sabor acabar, é
          só desligar.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {groups.map((g) => {
          const required = g.min_select > 0;
          return (
            <div key={g.key} className="grid gap-3 rounded-xl border border-border p-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
                <Field label="Nome da escolha">
                  <Input
                    value={g.name}
                    placeholder="Ex.: Sabor"
                    className="h-10"
                    onChange={(e) => updateGroup(g.key, { name: e.target.value })}
                  />
                </Field>
                <label className="flex h-10 items-center gap-2 text-sm">
                  <Switch
                    checked={required}
                    onCheckedChange={(v) =>
                      updateGroup(g.key, { min_select: v ? 1 : 0, max_select: Math.max(g.max_select, 1) })
                    }
                    label="Escolha obrigatória"
                  />
                  Obrigatório
                </label>
                <Field label="Pode escolher até">
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={g.max_select}
                    className="h-10 w-24"
                    onChange={(e) => updateGroup(g.key, { max_select: Math.max(1, Number(e.target.value) || 1) })}
                  />
                </Field>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remover ${g.name || "escolha"}`}
                  onClick={() => onChange(groups.filter((x) => x.key !== g.key))}
                >
                  <Trash2 className="text-muted-foreground" />
                </Button>
              </div>

              <div className="grid gap-2">
                <div className="hidden grid-cols-[1fr_7rem_6.5rem_2.5rem] gap-2 px-1 text-xs font-medium text-muted-foreground sm:grid">
                  <span>Opção</span>
                  <span>Valor a mais</span>
                  <span>Hoje</span>
                  <span />
                </div>
                {g.options.map((o) => (
                  <div
                    key={o.key}
                    className="grid grid-cols-[1fr_auto_2.5rem] items-center gap-2 border-b border-border/60 pb-2 last:border-0 sm:grid-cols-[1fr_7rem_6.5rem_2.5rem] sm:border-0 sm:pb-0"
                  >
                    <Input
                      value={o.name}
                      placeholder="Ex.: Coca-Cola"
                      aria-label="Nome da opção"
                      className={cn("col-span-3 h-10 sm:col-span-1", !o.active && "text-muted-foreground line-through")}
                      onChange={(e) => updateOption(g.key, o.key, { name: e.target.value })}
                    />
                    <Input
                      value={o.price}
                      placeholder="R$ 0,00"
                      inputMode="decimal"
                      aria-label="Valor a mais"
                      className="h-10 w-32 sm:w-full"
                      onChange={(e) => updateOption(g.key, o.key, { price: e.target.value })}
                    />
                    <label className="flex items-center gap-2 text-xs">
                      <Switch
                        checked={o.active}
                        onCheckedChange={(v) => updateOption(g.key, o.key, { active: v })}
                        label={o.active ? "Tem hoje" : "Acabou"}
                      />
                      <span className={cn(!o.active && "font-semibold text-amber-700")}>
                        {o.active ? "Tem" : "Acabou"}
                      </span>
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remover ${o.name || "opção"}`}
                      onClick={() => updateGroup(g.key, { options: g.options.filter((x) => x.key !== o.key) })}
                    >
                      <Trash2 className="text-muted-foreground" />
                    </Button>
                  </div>
                ))}
                <div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => updateGroup(g.key, { options: [...g.options, emptyOption()] })}
                  >
                    <Plus /> Adicionar opção
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  “Valor a mais” é opcional: deixe vazio quando todas as opções custam o mesmo preço do produto.
                </p>
              </div>
            </div>
          );
        })}
        <div className="flex flex-wrap gap-2">
          {groups.length === 0 ? (
            <Button type="button" variant="outline" size="sm" onClick={() => addGroup("Sabor", true)}>
              <Plus /> Adicionar escolha de sabor
            </Button>
          ) : null}
          <Button type="button" variant="ghost" size="sm" onClick={() => addGroup("", false)}>
            <Plus /> {groups.length === 0 ? "Outra escolha" : "Adicionar outra escolha"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
