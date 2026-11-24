"use client";

import { useState, useTransition } from "react";
import { Check, Copy, MessageCircle, RefreshCw } from "lucide-react";
import { regenerateCourierLink, setCourierPayout } from "@/app/painel/motoboys/actions";
import { Button } from "@/components/ui/button";
import { whatsappUrl } from "@/lib/couriers";

/** Copiar / mandar pelo WhatsApp o link do site do motoboy, ou gerar um link novo. */
export function CourierLink({ id, name, phone, token }: { id: string; name: string; phone: string | null; token: string }) {
  const [current, setCurrent] = useState(token);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const url = () => `${window.location.origin}/entregador/${current}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={async () => {
          await navigator.clipboard.writeText(url()).catch(() => undefined);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? <Check /> : <Copy />} {copied ? "Link copiado" : "Copiar link"}
      </Button>
      {phone ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            window.open(
              whatsappUrl(phone, `Oi, ${name.split(" ")[0]}! Este é o seu link para ver as entregas e o acerto do dia: ${url()}`),
              "_blank",
            )
          }
        >
          <MessageCircle /> Mandar no WhatsApp
        </Button>
      ) : null}
      {confirming ? (
        <span className="flex items-center gap-2 text-sm">
          O link atual vai parar de funcionar.
          <Button
            size="sm"
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const next = await regenerateCourierLink(id);
                if (next) setCurrent(next);
                setConfirming(false);
              })
            }
          >
            Gerar novo
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
            Voltar
          </Button>
        </span>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setConfirming(true)} title="Use se o celular dele foi perdido ou trocado">
          <RefreshCw /> Novo link
        </Button>
      )}
    </div>
  );
}

/** Marcar o acerto de um dia como pago (ou desfazer). */
export function PayoutToggle({ courierId, day, paid }: { courierId: string; day: string; paid: boolean }) {
  const [isPaid, setIsPaid] = useState(paid);
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant={isPaid ? "ghost" : "outline"}
      disabled={pending}
      className={isPaid ? "text-emerald-700" : undefined}
      title={isPaid ? "Toque para desfazer" : undefined}
      onClick={() =>
        startTransition(async () => {
          const r = await setCourierPayout(courierId, day, !isPaid);
          if (r.ok) setIsPaid(!isPaid);
        })
      }
    >
      {isPaid ? <Check /> : null}
      {pending ? "..." : isPaid ? "Pago" : "Marcar pago"}
    </Button>
  );
}
