"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { deleteCategory, saveCategory, type MenuFormState } from "@/app/painel/cardapio/actions";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { Category } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DeleteButton } from "./delete-button";

type SizeRow = { key: number; id: string; name: string; max_flavors: number };
type OptionRow = { key: number; id: string; name: string; price: string; active: boolean };
type GroupRow = { key: number; id: string; name: string; min_select: number; max_select: number; options: OptionRow[] };

const toInput = (cents: number) => (cents ? (cents / 100).toFixed(2).replace(".", ",") : "");

const PIZZA_SIZES = [
  { name: "Broto", max_flavors: 1 },
  { name: "Média", max_flavors: 2 },
  { name: "Grande", max_flavors: 2 },
];

export function CategoryEditor({ category }: { category: Category | null }) {
  const [state, action, pending] = useActionState<MenuFormState, FormData>(saveCategory, {});
  const key = useRef(1000);
  const next = () => key.current++;

  const [name, setName] = useState(category?.name ?? "");
  const [description, setDescription] = useState(category?.description ?? "");
  const [active, setActive] = useState(category?.active ?? true);
  const [hasSizes, setHasSizes] = useState(category?.has_sizes ?? false);
  const [rule, setRule] = useState(category?.half_price_rule ?? "highest");
  const [sizes, setSizes] = useState<SizeRow[]>(
    category?.sizes.map((s, i) => ({ key: i, id: s.id, name: s.name, max_flavors: s.max_flavors })) ?? [],
  );
  const [groups, setGroups] = useState<GroupRow[]>(
    category?.groups.map((g, i) => ({
      key: 100 + i,
      id: g.id,
      name: g.name,
      min_select: g.min_select,
      max_select: g.max_select,
      options: g.options.map((o, j) => ({
        key: 500 + i * 50 + j,
        id: o.id,
        name: o.name,
        price: toInput(o.price_cents),
        active: o.active,
      })),
    })) ?? [],
  );

  const updateGroup = (k: number, patch: Partial<GroupRow>) =>
    setGroups((gs) => gs.map((g) => (g.key === k ? { ...g, ...patch } : g)));
  const updateOption = (gk: number, ok: number, patch: Partial<OptionRow>) =>
    setGroups((gs) =>
      gs.map((g) =>
        g.key === gk ? { ...g, options: g.options.map((o) => (o.key === ok ? { ...o, ...patch } : o)) } : g,
      ),
    );

  const multiFlavor = hasSizes && sizes.some((s) => s.max_flavors > 1);

  const payload = JSON.stringify({
    id: category?.id ?? "",
    name,
    description,
    active,
    has_sizes: hasSizes,
    half_price_rule: rule,
    sizes: sizes.map(({ id, name, max_flavors }) => ({ id, name, max_flavors })),
    groups: groups.map(({ id, name, min_select, max_select, options }) => ({
      id,
      name,
      min_select,
      max_select,
      options: options.map(({ id, name, price, active }) => ({ id, name, price: price || "0", active })),
    })),
  });

  return (
    <div className="grid gap-6">
    <form action={action} className="grid gap-6">
      <input type="hidden" name="payload" value={payload} />
      {state.message ? <Alert tone="error">{state.message}</Alert> : null}

      <Card>
        <CardContent className="grid gap-5">
          <div className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-end">
            <Field label="Nome da categoria" htmlFor="name">
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Pizzas, Lanches, Bebidas"
                required
              />
            </Field>
            <label className="flex h-11 items-center gap-3 text-sm">
              <Switch checked={active} onCheckedChange={setActive} label="Categoria visível no site" />
              {active ? "Visível no site" : "Escondida"}
            </label>
          </div>
          <Field label="Descrição (opcional)" htmlFor="description">
            <Textarea
              id="description"
              className="min-h-16"
              maxLength={200}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex.: Todas as pizzas com massa de fermentação natural."
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preço</CardTitle>
          <CardDescription>Escolha como os produtos desta categoria são cobrados.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { value: false, title: "Preço único", text: "Lanches, porções, bebidas..." },
              { value: true, title: "Preço por tamanho", text: "Pizzas, açaí, sucos... com opção de vários sabores" },
            ].map((opt) => (
              <button
                key={opt.title}
                type="button"
                onClick={() => {
                  setHasSizes(opt.value);
                  if (opt.value && sizes.length === 0) {
                    setSizes(PIZZA_SIZES.map((s) => ({ key: next(), id: "", ...s })));
                  }
                }}
                className={cn(
                  "rounded-xl border p-4 text-left transition-colors",
                  hasSizes === opt.value ? "border-brand bg-brand/5 ring-2 ring-brand/20" : "border-border hover:bg-muted",
                )}
              >
                <p className="font-semibold">{opt.title}</p>
                <p className="text-sm text-muted-foreground">{opt.text}</p>
              </button>
            ))}
          </div>

          {hasSizes ? (
            <div className="grid gap-3">
              <div className="hidden grid-cols-[1fr_11rem_2.5rem] gap-2 px-1 text-xs font-medium text-muted-foreground sm:grid">
                <span>Tamanho</span>
                <span>Sabores</span>
                <span />
              </div>
              {sizes.map((s) => (
                <div key={s.key} className="grid grid-cols-[1fr_9rem_2.5rem] items-center gap-2 sm:grid-cols-[1fr_11rem_2.5rem]">
                  <Input
                    value={s.name}
                    aria-label="Nome do tamanho"
                    placeholder="Ex.: Grande"
                    className="h-10"
                    onChange={(e) =>
                      setSizes((all) => all.map((x) => (x.key === s.key ? { ...x, name: e.target.value } : x)))
                    }
                  />
                  <select
                    value={s.max_flavors}
                    aria-label="Quantidade de sabores"
                    onChange={(e) =>
                      setSizes((all) =>
                        all.map((x) => (x.key === s.key ? { ...x, max_flavors: Number(e.target.value) } : x)),
                      )
                    }
                    className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
                  >
                    <option value={1}>1 sabor</option>
                    <option value={2}>Até 2 sabores</option>
                    <option value={3}>Até 3 sabores</option>
                    <option value={4}>Até 4 sabores</option>
                  </select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remover ${s.name || "tamanho"}`}
                    onClick={() => setSizes((all) => all.filter((x) => x.key !== s.key))}
                  >
                    <Trash2 className="text-muted-foreground" />
                  </Button>
                </div>
              ))}
              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSizes((all) => [...all, { key: next(), id: "", name: "", max_flavors: 1 }])}
                >
                  <Plus /> Adicionar tamanho
                </Button>
              </div>
              {category && sizes.length < category.sizes.length ? (
                <p className="text-xs text-amber-700">
                  Ao remover um tamanho, os preços desse tamanho em todos os produtos também são apagados.
                </p>
              ) : null}

              {multiFlavor ? (
                <fieldset className="grid gap-2 rounded-xl bg-muted/60 p-4">
                  <legend className="sr-only">Preço com mais de um sabor</legend>
                  <p className="text-sm font-medium">Com mais de um sabor, cobrar:</p>
                  {[
                    { value: "highest", label: "Pelo sabor mais caro", hint: "O mais comum nas pizzarias." },
                    { value: "average", label: "Pela média dos sabores", hint: "Arredondada para cima." },
                  ].map((o) => (
                    <label key={o.value} className="flex cursor-pointer items-start gap-2 text-sm">
                      <input
                        type="radio"
                        name="rule"
                        checked={rule === o.value}
                        onChange={() => setRule(o.value as "highest" | "average")}
                        className="mt-0.5 accent-[var(--brand)]"
                      />
                      <span>
                        {o.label} <span className="text-muted-foreground">· {o.hint}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Adicionais</CardTitle>
          <CardDescription>
            Opções que o cliente escolhe em todos os produtos desta categoria, como borda recheada, ponto da carne ou
            adicionais do lanche.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {groups.map((g) => (
            <div key={g.key} className="grid gap-3 rounded-xl border border-border p-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
                <Field label="Nome do grupo">
                  <Input
                    value={g.name}
                    placeholder="Ex.: Borda recheada"
                    className="h-10"
                    onChange={(e) => updateGroup(g.key, { name: e.target.value })}
                  />
                </Field>
                <label className="flex h-10 items-center gap-2 text-sm">
                  <Switch
                    checked={g.min_select > 0}
                    onCheckedChange={(v) => updateGroup(g.key, { min_select: v ? 1 : 0 })}
                    label="Escolha obrigatória"
                  />
                  Obrigatório
                </label>
                <Field label="Máximo de escolhas">
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
                  aria-label={`Remover grupo ${g.name}`}
                  onClick={() => setGroups((gs) => gs.filter((x) => x.key !== g.key))}
                >
                  <Trash2 className="text-muted-foreground" />
                </Button>
              </div>
              <div className="grid gap-2">
                {g.options.map((o) => (
                  <div key={o.key} className="grid grid-cols-[1fr_7rem_auto_2.5rem] items-center gap-2">
                    <Input
                      value={o.name}
                      placeholder="Ex.: Catupiry"
                      aria-label="Nome da opção"
                      className="h-10"
                      onChange={(e) => updateOption(g.key, o.key, { name: e.target.value })}
                    />
                    <Input
                      value={o.price}
                      placeholder="Grátis"
                      inputMode="decimal"
                      aria-label="Preço da opção"
                      className="h-10"
                      onChange={(e) => updateOption(g.key, o.key, { price: e.target.value })}
                    />
                    <Switch
                      checked={o.active}
                      onCheckedChange={(v) => updateOption(g.key, o.key, { active: v })}
                      label={o.active ? "Disponível" : "Pausado"}
                    />
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
                    onClick={() =>
                      updateGroup(g.key, {
                        options: [...g.options, { key: next(), id: "", name: "", price: "", active: true }],
                      })
                    }
                  >
                    <Plus /> Adicionar opção
                  </Button>
                </div>
              </div>
            </div>
          ))}
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setGroups((gs) => [
                  ...gs,
                  {
                    key: next(),
                    id: "",
                    name: "",
                    min_select: 0,
                    max_select: 1,
                    options: [{ key: next(), id: "", name: "", price: "", active: true }],
                  },
                ])
              }
            >
              <Plus /> Adicionar grupo de adicionais
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Salvando..." : "Salvar categoria"}
        </Button>
        <Link href="/painel/cardapio" className={buttonVariants({ variant: "ghost", size: "lg" })}>
          Cancelar
        </Link>
      </div>
    </form>
      {category ? (
        <div className="border-t border-border pt-4">
          <DeleteButton
            action={deleteCategory}
            id={category.id}
            label="Excluir categoria"
            warning={`Os ${category.products.length} produto(s) desta categoria também serão excluídos.`}
          />
        </div>
      ) : null}
    </div>
  );
}
