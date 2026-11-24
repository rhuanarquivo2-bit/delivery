"use client";

import { useOptimistic, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Check } from "lucide-react";
import { move, setActive, updatePrice } from "@/app/painel/cardapio/actions";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export function ActiveSwitch({
  kind,
  id,
  active,
}: {
  kind: "product" | "category";
  id: string;
  active: boolean;
}) {
  const [optimistic, setOptimistic] = useOptimistic(active);
  const [, startTransition] = useTransition();
  return (
    <Switch
      checked={optimistic}
      label={optimistic ? "Disponível (toque para pausar)" : "Pausado (toque para ativar)"}
      onCheckedChange={(value) =>
        startTransition(async () => {
          setOptimistic(value);
          await setActive(kind, id, value);
        })
      }
    />
  );
}

export function MoveButtons({
  kind,
  id,
  first,
  last,
}: {
  kind: "product" | "category";
  id: string;
  first: boolean;
  last: boolean;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex">
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        aria-label="Subir"
        disabled={first || pending}
        onClick={() => startTransition(() => move(kind, id, "up"))}
      >
        <ArrowUp />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        aria-label="Descer"
        disabled={last || pending}
        onClick={() => startTransition(() => move(kind, id, "down"))}
      >
        <ArrowDown />
      </Button>
    </div>
  );
}

function toInput(cents: number | null) {
  return cents === null ? "" : (cents / 100).toFixed(2).replace(".", ",");
}

/** Preço editável direto na lista: digita e sai do campo (ou Enter) para salvar. */
export function QuickPrice({
  productId,
  sizeId,
  cents,
  label,
}: {
  productId: string;
  sizeId: string | null;
  cents: number | null;
  label?: string;
}) {
  const [value, setValue] = useState(toInput(cents));
  const [saved, setSaved] = useState(toInput(cents));
  const [status, setStatus] = useState<"idle" | "saving" | "ok" | "error">("idle");

  const save = async () => {
    if (value === saved) return;
    setStatus("saving");
    const result = await updatePrice(productId, sizeId, value);
    if (result.ok) {
      const formatted = toInput(result.cents ?? null);
      setValue(formatted);
      setSaved(formatted);
      setStatus("ok");
      setTimeout(() => setStatus("idle"), 1500);
    } else {
      setStatus("error");
    }
  };

  return (
    <label className="flex flex-col gap-0.5">
      {label ? <span className="text-[11px] text-muted-foreground">{label}</span> : null}
      <span
        className={cn(
          "flex h-9 w-24 items-center rounded-lg border bg-background px-2 text-sm focus-within:border-brand",
          status === "error" ? "border-red-500" : "border-border",
        )}
      >
        <span className="mr-1 text-xs text-muted-foreground">R$</span>
        <input
          value={value}
          inputMode="decimal"
          placeholder="—"
          aria-label={`Preço${label ? ` ${label}` : ""}`}
          onChange={(e) => {
            setValue(e.target.value);
            setStatus("idle");
          }}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="w-full min-w-0 bg-transparent outline-none"
        />
        {status === "ok" ? <Check className="size-3.5 shrink-0 text-emerald-600" /> : null}
      </span>
    </label>
  );
}
