import { setOpenOverride } from "@/app/painel/loja/actions";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "auto", label: "Seguir horário" },
  { value: "open", label: "Aberta agora" },
  { value: "closed", label: "Fechada agora" },
] as const;

export function OpenToggle({ override }: { override: boolean | null }) {
  const current = override === null ? "auto" : override ? "open" : "closed";
  return (
    <form action={setOpenOverride} className="inline-flex rounded-xl bg-muted p-1">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          name="override"
          value={o.value}
          className={cn(
            "cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
            current === o.value ? "bg-card shadow-xs" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </form>
  );
}
