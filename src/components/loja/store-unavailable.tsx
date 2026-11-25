import Image from "next/image";
import { Store as StoreIcon } from "lucide-react";
import type { Store } from "@/lib/types";

/** Site da loja quando o acesso ao sistema venceu ou foi bloqueado. */
export function StoreUnavailable({ store }: { store: Pick<Store, "name" | "logo_url" | "primary_color"> }) {
  return (
    <div className="flex-1" style={{ "--brand": store.primary_color } as React.CSSProperties} data-store-unavailable>
      <div className="h-32 bg-brand sm:h-44" />
      <main className="mx-auto -mt-14 max-w-lg px-4 pb-20">
        <section className="rounded-3xl border border-border bg-card p-6 text-center shadow-sm sm:p-8">
          <div className="relative mx-auto size-20 overflow-hidden rounded-2xl border-4 border-card bg-muted shadow-sm">
            {store.logo_url ? (
              <Image src={store.logo_url} alt={`Logo ${store.name}`} fill sizes="80px" className="object-cover" />
            ) : (
              <div className="flex size-full items-center justify-center bg-brand text-3xl font-bold text-brand-foreground">
                {store.name.slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">{store.name}</h1>
          <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-sm font-medium text-muted-foreground">
            <StoreIcon className="size-4" /> Indisponível no momento
          </p>
          <p className="mt-4 text-muted-foreground">
            Esta loja não está recebendo pedidos pelo site agora. Volte mais tarde.
          </p>
        </section>
      </main>
    </div>
  );
}
