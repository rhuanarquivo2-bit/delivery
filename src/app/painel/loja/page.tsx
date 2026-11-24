import { Alert } from "@/components/ui/alert";
import { HoursForm, LogoForm, SiteSettingsForm, StoreInfoForm, ZonesForm } from "@/components/painel/loja/store-forms";
import { getStoreSettings, requireMyStore } from "@/lib/stores";
import { rootDomainLabel } from "@/lib/tenant";

export const metadata = { title: "Minha loja" };

export default async function MinhaLojaPage({ searchParams }: PageProps<"/painel/loja">) {
  const { criada } = await searchParams;
  const { store } = await requireMyStore();
  const { hours, zones } = await getStoreSettings(store.id);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Minha loja</h1>
        <p className="text-muted-foreground">Informações que aparecem no seu site e nos pedidos.</p>
      </div>
      {criada ? (
        <Alert tone="success">Loja criada! Agora envie o logo, defina os horários e cadastre os bairros de entrega.</Alert>
      ) : null}
      <section id="logo" className="scroll-mt-20">
        <LogoForm store={store} />
      </section>
      <StoreInfoForm store={store} rootDomainLabel={rootDomainLabel} />
      <section id="horarios" className="scroll-mt-20">
        <HoursForm hours={hours} />
      </section>
      <section id="bairros" className="scroll-mt-20">
        <ZonesForm zones={zones} />
      </section>
      <section id="site" className="scroll-mt-20">
        <SiteSettingsForm store={store} />
      </section>
    </div>
  );
}
