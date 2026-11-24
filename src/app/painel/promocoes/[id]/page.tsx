import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { deletePromotion } from "@/app/painel/promocoes/actions";
import { DeleteButton } from "@/components/painel/cardapio/delete-button";
import { PromotionForm } from "@/components/painel/promocoes/promotion-form";
import { getMenu } from "@/lib/menu";
import { requireMyStore } from "@/lib/stores";
import { createClient } from "@/lib/supabase/server";
import type { Promotion } from "@/lib/types";

export const metadata = { title: "Promoção" };

export default async function PromocaoPage({ params }: PageProps<"/painel/promocoes/[id]">) {
  const { id } = await params;
  const { store } = await requireMyStore();
  const menu = await getMenu(store.id);

  let promotion: Promotion | null = null;
  if (id !== "nova") {
    if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
    const supabase = await createClient();
    const { data } = await supabase.from("promotions").select("*").eq("id", id).eq("store_id", store.id).maybeSingle();
    if (!data) notFound();
    promotion = data as Promotion;
  }

  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6">
      <div>
        <Link
          href="/painel/promocoes"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> Promoções
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{promotion ? "Editar promoção" : "Nova promoção"}</h1>
      </div>
      <PromotionForm promotion={promotion} categories={menu} />
      {promotion ? (
        <DeleteButton
          action={deletePromotion}
          id={promotion.id}
          label="Excluir promoção"
          warning="Excluir de vez? Pedidos antigos continuam com o preço que foi cobrado."
        />
      ) : null}
    </div>
  );
}
