import { FlaskConical } from "lucide-react";

/** Aviso fixo nas páginas de uma loja de demonstração. */
export function DemoStoreBanner({ text }: { text?: string }) {
  return (
    <div data-demo-banner className="flex items-center justify-center gap-2 bg-stone-900 px-4 py-2 text-center text-xs font-medium text-white">
      <FlaskConical className="size-3.5 shrink-0" />
      {text ?? "Loja de demonstração. Os pedidos e pagamentos são de mentira, pode testar à vontade."}
    </div>
  );
}
