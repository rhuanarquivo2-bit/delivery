import Image from "next/image";
import Link from "next/link";
import { Camera, ImageIcon, Pencil, Plus } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { ActiveSwitch, MoveButtons, QuickPrice } from "@/components/painel/cardapio/list-controls";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getMenu } from "@/lib/menu";
import { requireMyStore } from "@/lib/stores";
import { cn } from "@/lib/utils";

export const metadata = { title: "Cardápio" };

export default async function CardapioPage({ searchParams }: PageProps<"/painel/cardapio">) {
  const { importado } = await searchParams;
  const { store } = await requireMyStore();
  const categories = await getMenu(store.id);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cardápio</h1>
          <p className="text-muted-foreground">
            Altere preços direto na lista e pause o que acabou com um toque.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/painel/cardapio/importar" className={buttonVariants({ variant: "outline" })}>
            <Camera /> Importar por foto
          </Link>
          <Link href="/painel/cardapio/categoria/nova" className={buttonVariants({ variant: "outline" })}>
            <Plus /> Nova categoria
          </Link>
        </div>
      </div>

      {importado ? (
        <Alert tone="success">
          Cardápio importado. Confira os itens abaixo, adicione fotos dos produtos e ajuste o que precisar.
        </Alert>
      ) : null}

      {categories.length === 0 ? (
        <Card className="px-6 py-14 text-center">
          <h2 className="text-lg font-semibold">Seu cardápio está vazio</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Tire uma foto do seu cardápio impresso e a IA monta tudo para você revisar. Se preferir, crie as categorias
            (Pizzas, Lanches, Bebidas...) e os produtos à mão.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/painel/cardapio/importar" className={buttonVariants()}>
              <Camera /> Importar por foto
            </Link>
            <Link href="/painel/cardapio/categoria/nova" className={buttonVariants({ variant: "outline" })}>
              <Plus /> Criar à mão
            </Link>
          </div>
        </Card>
      ) : null}

      {categories.map((category, ci) => (
        <Card key={category.id} className={cn("overflow-hidden", !category.active && "opacity-70")}>
          <div className="flex flex-wrap items-center gap-3 border-b border-border bg-muted/40 px-4 py-3 sm:px-5">
            <MoveButtons kind="category" id={category.id} first={ci === 0} last={ci === categories.length - 1} />
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-semibold">{category.name}</h2>
              <p className="text-xs text-muted-foreground">
                {category.products.length} produto(s)
                {category.has_sizes ? ` · Tamanhos: ${category.sizes.map((s) => s.name).join(", ")}` : ""}
                {category.groups.length ? ` · ${category.groups.map((g) => g.name).join(", ")}` : ""}
              </p>
            </div>
            <ActiveSwitch kind="category" id={category.id} active={category.active} />
            <Link
              href={`/painel/cardapio/categoria/${category.id}`}
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              <Pencil /> Editar
            </Link>
          </div>

          <ul className="divide-y divide-border">
            {category.products.map((product, pi) => (
              <li
                key={product.id}
                className={cn("flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5", !product.active && "opacity-60")}
              >
                <MoveButtons
                  kind="product"
                  id={product.id}
                  first={pi === 0}
                  last={pi === category.products.length - 1}
                />
                <div className="relative size-12 shrink-0 overflow-hidden rounded-xl bg-muted">
                  {product.image_url ? (
                    <Image src={product.image_url} alt="" fill sizes="48px" className="object-cover" />
                  ) : (
                    <ImageIcon className="absolute inset-0 m-auto size-5 text-muted-foreground/60" />
                  )}
                </div>
                <div className="min-w-0 flex-1 basis-40">
                  <p className="truncate font-medium">{product.name}</p>
                  {product.description ? (
                    <p className="truncate text-xs text-muted-foreground">{product.description}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  {category.has_sizes ? (
                    category.sizes.map((size) => (
                      <QuickPrice
                        key={size.id}
                        productId={product.id}
                        sizeId={size.id}
                        label={size.name}
                        cents={product.prices.find((p) => p.size_id === size.id)?.price_cents ?? null}
                      />
                    ))
                  ) : (
                    <QuickPrice productId={product.id} sizeId={null} cents={product.price_cents} />
                  )}
                </div>
                <ActiveSwitch kind="product" id={product.id} active={product.active} />
                <Link
                  href={`/painel/cardapio/produto/${product.id}`}
                  className={buttonVariants({ variant: "ghost", size: "icon" })}
                  aria-label={`Editar ${product.name}`}
                >
                  <Pencil />
                </Link>
              </li>
            ))}
          </ul>
          <div className="px-4 py-3 sm:px-5">
            <Link
              href={`/painel/cardapio/produto/novo?categoria=${category.id}`}
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              <Plus /> Adicionar produto em {category.name}
            </Link>
          </div>
        </Card>
      ))}
    </div>
  );
}
