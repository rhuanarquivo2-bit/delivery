"use client";

import { useOptimistic, useTransition } from "react";
import { setCouponActive } from "@/app/painel/cupons/actions";
import { setRewardActive } from "@/app/painel/fidelidade/actions";
import { setCourierActive } from "@/app/painel/motoboys/actions";
import { setPromotionActive } from "@/app/painel/promocoes/actions";
import { Switch } from "@/components/ui/switch";

const ACTIONS = { promotion: setPromotionActive, coupon: setCouponActive, courier: setCourierActive, reward: setRewardActive };

/** Liga/desliga uma promoção, cupom ou motoboy direto da lista. */
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
