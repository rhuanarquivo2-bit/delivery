import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { CourierForm } from "@/components/painel/motoboys/courier-form";
import { requireMyStore } from "@/lib/stores";
import { createClient } from "@/lib/supabase/server";
import type { Courier } from "@/lib/types";

export const metadata = { title: "Motoboy" };

export default async function MotoboyPage({ params }: PageProps<"/painel/motoboys/[id]">) {
  const { id } = await params;
  const { store } = await requireMyStore();

  let courier: Courier | null = null;
  if (id !== "novo") {
    if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
    const supabase = await createClient();
    const { data } = await supabase.from("couriers").select("*").eq("id", id).eq("store_id", store.id).maybeSingle();
    if (!data) notFound();
    courier = data as Courier;
  }

  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6">
      <div>
        <Link href="/painel/motoboys" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> Motoboys
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{courier ? `Editar ${courier.name}` : "Novo motoboy"}</h1>
      </div>
      <CourierForm courier={courier} />
    </div>
  );
}
