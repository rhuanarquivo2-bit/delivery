import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { MenuImporter } from "@/components/painel/cardapio/menu-importer";
import { isMenuReaderConfigured } from "@/lib/menu-reader";
import { requireMyStore } from "@/lib/stores";

export const metadata = { title: "Importar cardápio por foto" };

// A leitura de várias fotos pela IA pode levar mais de um minuto.
export const maxDuration = 300;

export default async function ImportarPage() {
  await requireMyStore();
  return (
    <div className="grid gap-6">
      <div>
        <Link
          href="/painel/cardapio"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> Cardápio
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Importar cardápio por foto</h1>
        <p className="text-muted-foreground">
          A IA lê o cardápio impresso e monta categorias, tamanhos, produtos e preços. Você confere tudo antes de entrar no site.
        </p>
      </div>
      <MenuImporter configured={isMenuReaderConfigured()} />
    </div>
  );
}
