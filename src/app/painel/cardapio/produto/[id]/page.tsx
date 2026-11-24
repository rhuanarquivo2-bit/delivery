import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { ProductEditor } from "@/components/painel/cardapio/product-editor";
import { getMenu } from "@/lib/menu";
import { requireMyStore } from "@/lib/stores";

export const metadata = { title: "Produto" };

export default async function ProdutoPage({ params, searchParams }: PageProps<"/painel/cardapio/produto/[id]">) {
  const { id } = await params;
  const { categoria } = await searchParams;
  const { store } = await requireMyStore();
  const categories = await getMenu(store.id);
  if (categories.length === 0) redirect("/painel/cardapio/categoria/nova");

  const product = id === "novo" ? null : categories.flatMap((c) => c.products).find((p) => p.id === id);
  if (product === undefined) notFound();
  const initialCategory =
    product?.category_id ?? (typeof categoria === "string" ? categoria : undefined) ?? categories[0].id;

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <div>
        <Link href="/painel/cardapio" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> Cardápio
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">{product ? product.name : "Novo produto"}</h1>
      </div>
      <ProductEditor
        product={product}
        initialCategoryId={initialCategory}
        categories={categories.map((c) => ({ id: c.id, name: c.name, has_sizes: c.has_sizes, sizes: c.sizes }))}
      />
    </div>
  );
}
