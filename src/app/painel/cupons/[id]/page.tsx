import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { deleteCoupon } from "@/app/painel/cupons/actions";
import { DeleteButton } from "@/components/painel/cardapio/delete-button";
import { CouponForm } from "@/components/painel/cupons/coupon-form";
import { requireMyStore } from "@/lib/stores";
import { createClient } from "@/lib/supabase/server";
import type { Coupon } from "@/lib/types";

export const metadata = { title: "Cupom" };

export default async function CupomPage({ params }: PageProps<"/painel/cupons/[id]">) {
  const { id } = await params;
  const { store } = await requireMyStore();

  let coupon: Coupon | null = null;
  if (id !== "novo") {
    if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
    const supabase = await createClient();
    const { data } = await supabase.from("coupons").select("*").eq("id", id).eq("store_id", store.id).maybeSingle();
    if (!data) notFound();
    coupon = data as Coupon;
  }

  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6">
      <div>
        <Link
          href="/painel/cupons"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> Cupons
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{coupon ? "Editar cupom" : "Novo cupom"}</h1>
      </div>
      <CouponForm coupon={coupon} />
      {coupon ? (
        <DeleteButton
          action={deleteCoupon}
          id={coupon.id}
          label="Excluir cupom"
          warning="Excluir de vez? Para só parar de aceitar, é melhor pausar."
        />
      ) : null}
    </div>
  );
}
