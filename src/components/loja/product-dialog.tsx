"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import type { CartLine } from "@/lib/cart";
import { activePromoName, groupsFor, optionErrors, priceForSize, unitPrice, type CartSelection } from "@/lib/pricing";
import { promoPrice } from "@/lib/promotions";
import type { Category, Product } from "@/lib/types";
import { cn, formatBRL } from "@/lib/utils";

export function ProductDialog({
  category,
  product,
  open,
  canOrder,
  onClose,
  onAdd,
}: {
  category: Category;
  product: Product;
  open: boolean;
  canOrder: boolean;
  onClose: () => void;
  onAdd: (line: Omit<CartLine, "key">) => void;
}) {
  const availableSizes = category.has_sizes
    ? category.sizes.filter((s) => priceForSize(product, s.id) !== null)
    : [];
  const [sizeId, setSizeId] = useState<string | null>(
    availableSizes.length ? availableSizes[availableSizes.length - 1].id : null,
  );
  const [flavorIds, setFlavorIds] = useState<string[]>([]);
  const groups = useMemo(() => groupsFor(category, product).filter((g) => g.options.length), [category, product]);
  // escolha obrigatória com uma opção só (ex.: só tem um sabor hoje): já vem marcada
  const [optionIds, setOptionIds] = useState<string[]>(() =>
    groups.filter((g) => g.min_select === 1 && g.options.length === 1).map((g) => g.options[0].id),
  );
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [showErrors, setShowErrors] = useState(false);

  const size = category.sizes.find((s) => s.id === sizeId) ?? null;
  const maxFlavors = size?.max_flavors ?? 1;
  const flavorChoices =
    size && maxFlavors > 1
      ? category.products.filter((p) => p.id !== product.id && priceForSize(p, size.id) !== null)
      : [];
  const validFlavors = flavorIds.filter((id) => flavorChoices.some((p) => p.id === id)).slice(0, maxFlavors - 1);

  const selection: CartSelection = { productId: product.id, sizeId, flavorIds: validFlavors, optionIds, quantity, notes };
  const unit = unitPrice(category, selection, { partial: true });
  const fullUnit = unitPrice(category, selection, { withPromos: false, partial: true });
  const promo = activePromoName(category, product);
  const sizePrice = (p: Product, id: string) => {
    const raw = priceForSize(p, id);
    return raw === null ? null : promoPrice(raw, p.promos).price;
  };
  const errors = useMemo(() => optionErrors(category, optionIds, product), [category, optionIds, product]);
  const hasErrors = Object.keys(errors).length > 0 || unit === null;

  const toggleOption = (groupId: string, optionId: string, single: boolean) => {
    const group = groups.find((g) => g.id === groupId)!;
    const inGroup = new Set(group.options.map((o) => o.id));
    setOptionIds((ids) => {
      if (ids.includes(optionId)) return ids.filter((id) => id !== optionId);
      if (single) return [...ids.filter((id) => !inGroup.has(id)), optionId];
      const count = ids.filter((id) => inGroup.has(id)).length;
      return count >= group.max_select ? ids : [...ids, optionId];
    });
  };

  const add = () => {
    if (hasErrors || unit === null) {
      setShowErrors(true);
      return;
    }
    const flavorNames = validFlavors.map((id) => category.products.find((p) => p.id === id)!.name);
    // escolhas do produto aparecem como "Sabor: Coca-Cola"; adicionais da categoria só com o nome
    const chosen = groups.flatMap((g) =>
      g.options
        .filter((o) => optionIds.includes(o.id))
        .map((o) => (g.product_id ? `${g.name}: ${o.name}` : o.name)),
    );
    const details = [
      ...(flavorNames.length ? [`Sabores: ${[product.name, ...flavorNames].join(" + ")}`] : []),
      ...chosen,
      ...(notes.trim() ? [`Obs.: ${notes.trim()}`] : []),
    ];
    onAdd({
      categoryId: category.id,
      selection: { ...selection, notes: notes.trim() },
      title: size ? `${product.name} (${size.name})` : product.name,
      details,
      unitPriceCents: unit,
    });
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} label={product.name}>
      <div className="overflow-y-auto overflow-x-hidden">
        {product.image_url ? (
          <div className="relative aspect-[16/10] w-full bg-muted">
            <Image src={product.image_url} alt={product.name} fill sizes="512px" className="object-cover" />
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-6 p-5 pb-6">
          <div className={cn(!product.image_url && "pr-10")}>
            {promo ? (
              <span className="mb-1.5 inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                {promo}
              </span>
            ) : null}
            <h2 className="text-xl font-bold">{product.name}</h2>
            {product.description ? <p className="mt-1 text-sm text-muted-foreground">{product.description}</p> : null}
          </div>

          {availableSizes.length ? (
            <Section title="Tamanho" badge="Obrigatório">
              {availableSizes.map((s) => (
                <Choice
                  key={s.id}
                  type="radio"
                  checked={sizeId === s.id}
                  onChange={() => setSizeId(s.id)}
                  label={s.name}
                  hint={s.max_flavors > 1 ? `até ${s.max_flavors} sabores` : undefined}
                  price={sizePrice(product, s.id)}
                />
              ))}
            </Section>
          ) : null}

          {flavorChoices.length ? (
            <Section
              title={`Quer mais sabores? (até ${maxFlavors - 1})`}
              subtitle={
                category.half_price_rule === "highest"
                  ? "O preço fica o do sabor mais caro."
                  : "O preço fica a média dos sabores."
              }
            >
              {flavorChoices.map((p) => (
                <Choice
                  key={p.id}
                  type="checkbox"
                  checked={validFlavors.includes(p.id)}
                  disabled={!validFlavors.includes(p.id) && validFlavors.length >= maxFlavors - 1}
                  onChange={() =>
                    setFlavorIds((ids) => (ids.includes(p.id) ? ids.filter((x) => x !== p.id) : [...validFlavors, p.id]))
                  }
                  label={p.name}
                  hint={p.description ?? undefined}
                  price={size ? sizePrice(p, size.id) : null}
                />
              ))}
            </Section>
          ) : null}

          {groups.map((g) => {
              const single = g.max_select === 1;
              // sabor sem diferença de preço não mostra "Grátis" (o preço já está no produto)
              const choice = Boolean(g.product_id);
              return (
                <Section
                  key={g.id}
                  title={g.name}
                  badge={g.min_select > 0 ? "Obrigatório" : undefined}
                  subtitle={
                    single
                      ? choice && g.min_select > 0 && !(showErrors && errors[g.id])
                        ? "Escolha 1 opção"
                        : undefined
                      : g.min_select > 1
                        ? `Escolha de ${g.min_select} a ${g.max_select}`
                        : `Escolha até ${g.max_select}`
                  }
                  error={showErrors ? errors[g.id] : undefined}
                >
                  {g.options.map((o) => (
                    <Choice
                      key={o.id}
                      type={single ? "radio" : "checkbox"}
                      checked={optionIds.includes(o.id)}
                      onChange={() => toggleOption(g.id, o.id, single)}
                      label={o.name}
                      price={choice && !o.price_cents ? null : o.price_cents}
                      plus
                    />
                  ))}
                </Section>
              );
            })}

          <div className="grid gap-2">
            <label htmlFor="notes" className="text-sm font-semibold">
              Alguma observação?
            </label>
            <Textarea
              id="notes"
              maxLength={200}
              className="min-h-16"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex.: sem cebola, bem passado..."
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-border bg-card p-4">
        <div className="flex items-center rounded-xl border border-border">
          <button
            className="flex size-11 cursor-pointer items-center justify-center disabled:opacity-40"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            disabled={quantity <= 1}
            aria-label="Diminuir"
          >
            <Minus className="size-4" />
          </button>
          <span className="w-6 text-center font-semibold">{quantity}</span>
          <button
            className="flex size-11 cursor-pointer items-center justify-center"
            onClick={() => setQuantity((q) => Math.min(50, q + 1))}
            aria-label="Aumentar"
          >
            <Plus className="size-4" />
          </button>
        </div>
        <Button size="lg" className="flex-1 justify-between" onClick={add} disabled={!canOrder}>
          <span>{canOrder ? "Adicionar" : "Loja fechada"}</span>
          <span>
            {unit !== null && fullUnit !== null && fullUnit > unit ? (
              <span className="mr-1.5 text-xs font-normal line-through opacity-70">{formatBRL(fullUnit * quantity)}</span>
            ) : null}
            {unit !== null ? formatBRL(unit * quantity) : ""}
          </span>
        </Button>
      </div>
    </Dialog>
  );
}

function Section({
  title,
  subtitle,
  badge,
  error,
  children,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="grid min-w-0 gap-2">
      <legend className="mb-2 flex w-full items-center justify-between gap-2">
        <span>
          <span className="block font-semibold">{title}</span>
          {subtitle ? <span className="block text-xs text-muted-foreground">{subtitle}</span> : null}
        </span>
        {badge ? (
          <span className="rounded-full bg-foreground px-2 py-0.5 text-[10px] font-semibold uppercase text-background">
            {badge}
          </span>
        ) : null}
      </legend>
      {error ? <p className="text-xs font-medium text-red-600">{error}</p> : null}
      <div className="grid min-w-0 grid-cols-1 gap-2">{children}</div>
    </fieldset>
  );
}

function Choice({
  type,
  checked,
  disabled,
  onChange,
  label,
  hint,
  price,
  plus,
}: {
  type: "radio" | "checkbox";
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  label: string;
  hint?: string;
  price: number | null;
  plus?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex min-w-0 cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors",
        checked ? "border-brand bg-brand/5" : "border-border hover:bg-muted/60",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <input
        type={type}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="size-4 shrink-0 accent-[var(--brand)]"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        {hint ? <span className="block truncate text-xs text-muted-foreground">{hint}</span> : null}
      </span>
      {price !== null ? (
        <span className="shrink-0 text-sm text-muted-foreground">
          {plus ? (price ? `+ ${formatBRL(price)}` : "Grátis") : formatBRL(price)}
        </span>
      ) : null}
    </label>
  );
}
