"use client";

import { useOptimistic, useTransition } from "react";
import { setCouponActive } from "@/app/painel/cupons/actions";
import { setPromotionActive } from "@/app/painel/promocoes/actions";
import { Switch } from "@/components/ui/switch";

const ACTIONS = { promotion: setPromotionActive, coupon: setCouponActive };

/** Liga/desliga uma promoção ou cupom direto da lista. */
export function ToggleActive({ kind, id, active }: { kind: keyof typeof ACTIONS; id: string; active: boolean }) {
  const [optimistic, setOptimistic] = useOptimistic(active);
  const [, startTransition] = useTransition();
  return (
    <Switch
      checked={optimistic}
      label={optimistic ? "Ativo (toque para pausar)" : "Pausado (toque para ativar)"}
      onCheckedChange={(value) =>
        startTransition(async () => {
          setOptimistic(value);
          await ACTIONS[kind](id, value);
        })
      }
    />
  );
}
