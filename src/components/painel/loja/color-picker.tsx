"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const PRESETS = ["#E4572E", "#D62828", "#F77F00", "#2A9D8F", "#1D4ED8", "#7C3AED", "#111827"];

export function ColorPicker({ name, defaultValue }: { name: string; defaultValue: string }) {
  const [value, setValue] = useState(defaultValue.toUpperCase());
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input type="hidden" name={name} value={value} />
      {PRESETS.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`Cor ${c}`}
          onClick={() => setValue(c)}
          className={cn(
            "flex size-9 items-center justify-center rounded-full ring-offset-2 transition",
            value === c && "ring-2 ring-foreground/40",
          )}
          style={{ backgroundColor: c }}
        >
          {value === c ? <Check className="size-4 text-white" /> : null}
        </button>
      ))}
      <label className="flex h-9 cursor-pointer items-center gap-2 rounded-full border border-border px-3 text-xs text-muted-foreground">
        <input
          type="color"
          value={value}
          onChange={(e) => setValue(e.target.value.toUpperCase())}
          className="size-5 cursor-pointer rounded-full border-0 bg-transparent p-0"
        />
        Outra cor
      </label>
    </div>
  );
}
