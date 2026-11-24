import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { CategoryEditor } from "@/components/painel/cardapio/category-editor";
import { getMenu } from "@/lib/menu";
import { requireMyStore } from "@/lib/stores";

export const metadata = { title: "Categoria" };

export default async function CategoriaPage({ params }: PageProps<"/painel/cardapio/categoria/[id]">) {
  const { id } = await params;
  const { store } = await requireMyStore();
  const category = id === "nova" ? null : (await getMenu(store.id)).find((c) => c.id === id);
  if (category === undefined) notFound();

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <div>
        <Link href="/painel/cardapio" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> Cardápio
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">{category ? category.name : "Nova categoria"}</h1>
      </div>
      <CategoryEditor category={category} />
    </div>
  );
}
