"use client";

import { useEffect } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintToolbar({ auto }: { auto: boolean }) {
  useEffect(() => {
    if (auto) window.setTimeout(() => window.print(), 300);
  }, [auto]);
  return (
    <div className="mb-6 flex items-center justify-center gap-3 print:hidden">
      <Button onClick={() => window.print()}>
        <Printer /> Imprimir
      </Button>
      <p className="text-xs text-muted-foreground">Formato para impressora térmica de 80 mm.</p>
    </div>
  );
}
