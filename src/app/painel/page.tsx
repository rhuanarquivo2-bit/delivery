import Link from "next/link";
import { CheckCircle2, Circle, ExternalLink } from "lucide-react";
import { CreateStoreForm } from "@/components/painel/loja/create-store-form";
import { OpenToggle } from "@/components/painel/open-toggle";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isOpenNow } from "@/lib/hours";
import { getMyStore, getStoreSettings } from "@/lib/stores";
import { rootDomainLabel, storeUrl } from "@/lib/tenant";
import { cn } from "@/lib/utils";

export default async function PainelHome() {
  const mine = await getMyStore();

  if (!mine) {
    return (
      <div className="mx-auto max-w-lg">
        <h1 className="text-2xl font-bold tracking-tight">Vamos criar sua loja</h1>
        <p className="mt-1 text-muted-foreground">Só o básico agora. Você completa o resto quando quiser.</p>
        <Card className="mt-6">
          <CardContent>
            <CreateStoreForm rootDomain={rootDomainLabel} />
          </CardContent>
        </Card>
      </div>
    );
  }

  const { store } = mine;
  const { hours, zones } = await getStoreSettings(store.id);
  const open = isOpenNow(hours, store.open_override);

  const steps = [
    { done: true, label: "Criar a loja", href: "/painel/loja" },
    { done: Boolean(store.logo_url), label: "Enviar o logo", href: "/painel/loja#logo" },
    { done: hours.length > 0, label: "Definir o horário de funcionamento", href: "/painel/loja#horarios" },
    { done: zones.length > 0, label: "Cadastrar bairros e taxas de entrega", href: "/painel/loja#bairros" },
    { done: Boolean(store.address_street), label: "Preencher o endereço", href: "/painel/loja" },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Olá!</h1>
          <p className="text-muted-foreground">Este é o painel da {store.name}.</p>
        </div>
        <Link href={storeUrl(store.slug)} target="_blank" className={buttonVariants({ variant: "outline" })}>
          Ver meu site <ExternalLink />
        </Link>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className={cn("size-3 rounded-full", open ? "bg-emerald-500" : "bg-red-500")} />
            <div>
              <p className="font-semibold">{open ? "Loja aberta" : "Loja fechada"}</p>
              <p className="text-sm text-muted-foreground">
                {store.open_override === null ? "Seguindo o horário de funcionamento." : "Definido manualmente."}
              </p>
            </div>
          </div>
          <OpenToggle override={store.open_override} />
        </CardContent>
      </Card>

      {doneCount < steps.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Deixe sua loja pronta</CardTitle>
            <CardDescription>
              {doneCount} de {steps.length} passos concluídos.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-1">
            {steps.map((s) => (
              <Link
                key={s.label}
                href={s.href}
                className="flex items-center gap-3 rounded-xl px-2 py-2 text-sm hover:bg-muted"
              >
                {s.done ? (
                  <CheckCircle2 className="size-5 text-emerald-600" />
                ) : (
                  <Circle className="size-5 text-muted-foreground" />
                )}
                <span className={cn(s.done && "text-muted-foreground line-through")}>{s.label}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <p className="text-sm text-muted-foreground">
        Pedidos, cardápio, cupons, financeiro e motoboys chegam nas próximas fases.
      </p>
    </div>
  );
}
