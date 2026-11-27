"use client";

import { useState, useTransition } from "react";
import { Bike, Bell, ChefHat, ExternalLink, FlaskConical, Rocket } from "lucide-react";
import { leaveDemo, simulateDemoOrder } from "@/app/demo/actions";
import { Button } from "@/components/ui/button";

/** Barra do modo demonstração no topo do painel. */
export function DemoBar({ storeHref, courierHref }: { storeHref: string; courierHref: string | null }) {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  return (
    <div data-demo-bar className="border-b border-stone-800 bg-stone-900 text-white">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 text-sm md:px-8">
        <span className="flex items-center gap-2 font-semibold">
          <FlaskConical className="size-4" /> Demonstração
          <span className="font-normal text-stone-300">· seus dados de teste somem em 24 horas</span>
        </span>
        <div className="flex flex-wrap items-center gap-2 md:ml-auto">
          <Button
            size="sm"
            variant="outline"
            className="border-stone-600 bg-transparent text-white hover:bg-stone-800"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await simulateDemoOrder();
                setNote(r.ok ? `Pedido #${r.number} chegou! Veja em Pedidos.` : r.message);
                window.setTimeout(() => setNote(null), 5000);
              })
            }
          >
            <Bell /> {pending ? "Chegando..." : "Simular pedido"}
          </Button>
          <a
            href={storeHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-stone-600 px-3 text-sm font-semibold hover:bg-stone-800"
          >
            <ExternalLink className="size-4" /> Ver como cliente
          </a>
          <a
            href="/cozinha"
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-stone-600 px-3 text-sm font-semibold hover:bg-stone-800"
          >
            <ChefHat className="size-4" /> Ver cozinha (KDS)
          </a>
          {courierHref ? (
            <a
              href={courierHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-stone-600 px-3 text-sm font-semibold hover:bg-stone-800"
            >
              <Bike className="size-4" /> Ver como motoboy
            </a>
          ) : null}
          <form action={leaveDemo}>
            <Button size="sm" className="bg-white text-stone-900 hover:bg-stone-200">
              <Rocket /> Criar minha loja
            </Button>
          </form>
        </div>
      </div>
      {note ? (
        <p role="status" className="bg-emerald-600 px-4 py-1.5 text-center text-sm font-medium md:px-8">
          {note}
        </p>
      ) : null}
    </div>
  );
}
