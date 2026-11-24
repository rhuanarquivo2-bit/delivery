"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Excluir em dois toques: o primeiro pede confirmação. */
export function DeleteButton({
  action,
  id,
  label,
  warning,
}: {
  action: (formData: FormData) => Promise<void>;
  id: string;
  label: string;
  warning: string;
}) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <Button type="button" variant="ghost" className="text-red-600" onClick={() => setConfirming(true)}>
        <Trash2 /> {label}
      </Button>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">
      <input type="hidden" name="id" value={id} />
      <span>{warning}</span>
      <Button type="submit" variant="destructive" size="sm">
        Sim, excluir
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        Cancelar
      </Button>
    </form>
  );
}
