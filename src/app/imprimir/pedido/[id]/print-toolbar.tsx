"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type Via = "caixa" | "cozinha" | "ambas";

const VIAS: { key: Via; label: string }[] = [
  { key: "caixa", label: "Via do caixa" },
  { key: "cozinha", label: "Via da cozinha" },
  { key: "ambas", label: "As duas" },
];

export function PrintToolbar({ auto, via }: { auto: boolean; via: Via }) {
  const pathname = usePathname();
  useEffect(() => {
    if (auto) window.setTimeout(() => window.print(), 300);
  }, [auto]);
  return (
    <div className="mb-6 grid justify-items-center gap-3 print:hidden">
      <div className="flex rounded-xl border border-border p-1 text-sm">
        {VIAS.map((v) => (
          <Link
            key={v.key}
            href={`${pathname}?via=${v.key}`}
            replace
            className={cn(
              "rounded-lg px-3 py-1.5 font-medium",
              via === v.key ? "bg-brand text-brand-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {v.label}
          </Link>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={() => window.print()}>
          <Printer /> Imprimir
        </Button>
        <p className="text-xs text-muted-foreground">Formato para impressora térmica de 80 mm.</p>
      </div>
    </div>
  );
}
