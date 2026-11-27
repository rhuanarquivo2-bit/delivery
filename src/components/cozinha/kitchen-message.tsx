import { ChefHat } from "lucide-react";

/** Aviso em tela cheia (link inválido, loja suspensa...). */
export function KitchenMessage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-1 items-center justify-center bg-zinc-950 px-6 py-20 text-zinc-50">
      <div className="grid max-w-md justify-items-center gap-3 text-center">
        <span className="flex size-16 items-center justify-center rounded-3xl bg-zinc-800">
          <ChefHat className="size-8" />
        </span>
        <h1 className="text-2xl font-bold">{title}</h1>
        <div className="text-zinc-300">{children}</div>
      </div>
    </main>
  );
}
