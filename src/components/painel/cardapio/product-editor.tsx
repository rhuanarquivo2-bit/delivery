"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useState } from "react";
import { ImageUp, X } from "lucide-react";
import { deleteProduct, saveProduct, type MenuFormState } from "@/app/painel/cardapio/actions";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { CategorySize, Product } from "@/lib/types";
import { keepValuesOnSubmit } from "@/lib/use-keep-values-submit";
import { DeleteButton } from "./delete-button";

type CategoryChoice = { id: string; name: string; has_sizes: boolean; sizes: CategorySize[] };

const toInput = (cents: number | null | undefined) =>
  cents === null || cents === undefined ? "" : (cents / 100).toFixed(2).replace(".", ",");

export function ProductEditor({
  product,
  categories,
  initialCategoryId,
}: {
  product: Product | null;
  categories: CategoryChoice[];
  initialCategoryId: string;
}) {
  const [state, action, pending] = useActionState<MenuFormState, FormData>(saveProduct, {});
  const [categoryId, setCategoryId] = useState(initialCategoryId);
  const [name, setName] = useState(product?.name ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [active, setActive] = useState(product?.active ?? true);
  const [price, setPrice] = useState(toInput(product?.price_cents));
  const [sizePrices, setSizePrices] = useState<Record<string, string>>(
    Object.fromEntries(product?.prices.map((p) => [p.size_id, toInput(p.price_cents)]) ?? []),
  );
  const [imageUrl, setImageUrl] = useState(product?.image_url ?? null);
  const [preview, setPreview] = useState<string | null>(null);

  const category = categories.find((c) => c.id === categoryId) ?? categories[0];

  const payload = JSON.stringify({
    id: product?.id ?? "",
    category_id: category.id,
    name,
    description,
    active,
    price,
    prices: category.sizes.map((s) => ({ size_id: s.id, price: sizePrices[s.id] ?? "" })),
    image_url: imageUrl,
  });

  const shownImage = preview ?? imageUrl;

  return (
    <div className="grid gap-6">
      <form onSubmit={keepValuesOnSubmit(action)} className="grid gap-6">
        <input type="hidden" name="payload" value={payload} />
        {state.message ? <Alert tone="error">{state.message}</Alert> : null}

        <Card>
          <CardContent className="grid gap-5">
            <div className="flex flex-wrap items-start gap-5">
              <div className="relative size-28 shrink-0 overflow-hidden rounded-2xl border border-border bg-muted">
                {shownImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  preview ? <img src={preview} alt="" className="size-full object-cover" /> : (
                    <Image src={shownImage} alt="" fill sizes="112px" className="object-cover" />
                  )
                ) : (
                  <ImageUp className="absolute inset-0 m-auto size-7 text-muted-foreground/60" />
                )}
              </div>
              <div className="grid gap-2">
                <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold hover:bg-muted">
                  <ImageUp className="size-4" />
                  {shownImage ? "Trocar foto" : "Adicionar foto"}
                  <input
                    type="file"
                    name="image"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      setPreview(file ? URL.createObjectURL(file) : null);
                    }}
                  />
                </label>
                {shownImage ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setImageUrl(null);
                      setPreview(null);
                    }}
                  >
                    <X /> Remover foto
                  </Button>
                ) : null}
                <p className="text-xs text-muted-foreground">Opcional. Fotos vendem mais.</p>
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Nome" htmlFor="name">
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex.: Calabresa"
                  required
                />
              </Field>
              <Field label="Categoria" htmlFor="category">
                <select
                  id="category"
                  value={category.id}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="h-11 rounded-xl border border-border bg-background px-3 text-sm"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Descrição / ingredientes" htmlFor="description">
              <Textarea
                id="description"
                maxLength={400}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex.: Molho de tomate, mussarela, calabresa fatiada e cebola."
              />
            </Field>

            {category.has_sizes ? (
              <div className="grid gap-2">
                <p className="text-sm font-medium">Preço por tamanho</p>
                <div className="flex flex-wrap gap-3">
                  {category.sizes.map((s) => (
                    <label key={s.id} className="grid gap-1 text-xs text-muted-foreground">
                      {s.name}
                      <Input
                        value={sizePrices[s.id] ?? ""}
                        onChange={(e) => setSizePrices((p) => ({ ...p, [s.id]: e.target.value }))}
                        inputMode="decimal"
                        placeholder="R$ 0,00"
                        className="h-10 w-28"
                      />
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Deixe vazio o tamanho que este produto não tem.</p>
              </div>
            ) : (
              <Field label="Preço (R$)" htmlFor="price">
                <Input
                  id="price"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  inputMode="decimal"
                  placeholder="0,00"
                  className="w-40"
                />
              </Field>
            )}

            <label className="flex items-center gap-3 text-sm">
              <Switch checked={active} onCheckedChange={setActive} label="Disponível para venda" />
              {active ? "Disponível para venda" : "Pausado (não aparece no site)"}
            </label>
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "Salvando..." : "Salvar produto"}
          </Button>
          <Link href="/painel/cardapio" className={buttonVariants({ variant: "ghost", size: "lg" })}>
            Cancelar
          </Link>
        </div>
      </form>
      {product ? (
        <div className="border-t border-border pt-4">
          <DeleteButton
            action={deleteProduct}
            id={product.id}
            label="Excluir produto"
            warning="O produto sai do cardápio. Pedidos antigos continuam com o nome dele."
          />
        </div>
      ) : null}
    </div>
  );
}
