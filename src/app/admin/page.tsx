import Link from "next/link";
import { Search } from "lucide-react";
import { PlatformSettingsForm } from "@/components/admin/settings-form";
import { StoreAccessCard } from "@/components/admin/store-access-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { storeAccess, WARN_DAYS, type AccessState } from "@/lib/access";
import { getPlatformSettings, listAdminStores } from "@/lib/platform";
import { storeUrl } from "@/lib/tenant";
import { cn } from "@/lib/utils";

const FILTERS = [
  { key: "todas", label: "Todas" },
  { key: "ativas", label: "Com acesso" },
  { key: "vencendo", label: `Vencem em até ${WARN_DAYS} dias` },
  { key: "vencidas", label: "Vencidas" },
  { key: "bloqueadas", label: "Bloqueadas" },
] as const;
type Filter = (typeof FILTERS)[number]["key"];

function matches(filter: Filter, a: AccessState) {
  switch (filter) {
    case "ativas":
      return a.kind === "active" || a.kind === "unlimited";
    case "vencendo":
      return a.kind === "active" && a.daysLeft <= WARN_DAYS;
    case "vencidas":
      return a.kind === "expired";
    case "bloqueadas":
      return a.kind === "blocked";
    default:
      return true;
  }
}

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const sp = await searchParams;
  const filter = (FILTERS.find((f) => f.key === sp.filtro)?.key ?? "todas") as Filter;
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";

  const [stores, settings] = await Promise.all([listAdminStores(), getPlatformSettings()]);
  const now = new Date();
  const rows = stores.map((s) => ({ store: s, access: storeAccess({ ...s, is_demo: false }, now) }));
  const count = (f: Filter) => rows.filter((r) => matches(f, r.access)).length;
  const visible = rows.filter(
    (r) =>
      matches(filter, r.access) &&
      (!q || [r.store.name, r.store.slug, r.store.owner_email ?? ""].some((t) => t.toLowerCase().includes(q))),
  );

  const href = (f: Filter) => {
    const p = new URLSearchParams();
    if (f !== "todas") p.set("filtro", f);
    if (q) p.set("q", q);
    const s = p.toString();
    return s ? `/admin?${s}` : "/admin";
  };

  return (
    <div className="grid gap-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Lojas clientes</h1>
        <p className="mt-1 text-muted-foreground">
          Defina até quando cada loja pode usar o sistema, bloqueie e desbloqueie. Loja vencida ou bloqueada não recebe
          pedidos e o lojista vê o aviso no painel.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Lojas", value: rows.length, tone: "" },
          { label: "Com acesso", value: count("ativas"), tone: "text-emerald-700" },
          { label: "Vencidas", value: count("vencidas"), tone: "text-amber-700" },
          { label: "Bloqueadas", value: count("bloqueadas"), tone: "text-red-700" },
        ].map((t) => (
          <Card key={t.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t.label}</p>
              <p className={cn("mt-1 text-2xl font-bold tabular-nums", t.tone)}>{t.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <section className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={href(f.key)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                filter === f.key ? "border-brand bg-brand/10 text-brand" : "border-border hover:bg-muted",
              )}
            >
              {f.label} <span className="tabular-nums text-muted-foreground">({count(f.key)})</span>
            </Link>
          ))}
          <form className="relative w-full sm:ml-auto sm:w-64" action="/admin">
            {filter !== "todas" ? <input type="hidden" name="filtro" value={filter} /> : null}
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input name="q" defaultValue={q} placeholder="Buscar loja ou e-mail" className="pl-9" />
          </form>
        </div>

        {visible.length ? (
          <div className="grid gap-3">
            {visible.map(({ store, access }) => (
              <StoreAccessCard key={store.id} store={store} access={access} siteHref={storeUrl(store.slug)} />
            ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            {rows.length ? "Nenhuma loja nesse filtro." : "Nenhuma loja cadastrada ainda."}
          </p>
        )}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Configuração</CardTitle>
          <CardDescription>Vale para as lojas criadas daqui para frente.</CardDescription>
        </CardHeader>
        <CardContent>
          <PlatformSettingsForm settings={settings} />
        </CardContent>
      </Card>
    </div>
  );
}
