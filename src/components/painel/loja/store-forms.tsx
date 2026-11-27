"use client";

import Image from "next/image";
import { useActionState, useEffect, useRef, useState } from "react";
import { ImageUp, Plus, Trash2 } from "lucide-react";
import {
  saveHours,
  saveZones,
  updateSiteSettings,
  updateStoreInfo,
  uploadLogo,
  type FormState,
} from "@/app/painel/loja/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { shortTime, WEEKDAYS } from "@/lib/hours";
import type { DeliveryZone, Store, StoreHour } from "@/lib/types";
import { feeInputFor, NOT_SERVED_LABEL, parseZoneFee } from "@/lib/zones";
import { cn } from "@/lib/utils";
import { keepValuesOnSubmit } from "@/lib/use-keep-values-submit";
import { ColorPicker } from "./color-picker";

function Feedback({ state }: { state: FormState }) {
  if (!state.message) return null;
  return <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>;
}

function centsToInput(cents: number) {
  return cents ? (cents / 100).toFixed(2).replace(".", ",") : "";
}

// ---------------------------------------------------------------------------
export function StoreInfoForm({ store, rootDomainLabel }: { store: Store; rootDomainLabel: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateStoreInfo, {});
  const e = state.errors ?? {};
  return (
    <Card>
      <CardHeader>
        <CardTitle>Dados da loja</CardTitle>
        <CardDescription>Aparecem no topo do seu site e no comprovante do pedido.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={keepValuesOnSubmit(action)} className="grid gap-5">
          <Feedback state={state} />
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Nome da loja" htmlFor="name" error={e.name}>
              <Input id="name" name="name" defaultValue={store.name} required />
            </Field>
            <Field label="Endereço do site" htmlFor="slug" error={e.slug} hint={`${store.slug}.${rootDomainLabel}`}>
              <Input id="slug" name="slug" defaultValue={store.slug} required />
            </Field>
          </div>
          <Field label="Descrição curta" htmlFor="description" error={e.description} hint="Até 280 caracteres.">
            <Textarea
              id="description"
              name="description"
              maxLength={280}
              defaultValue={store.description ?? ""}
              placeholder="Ex.: Pizzas artesanais no forno a lenha desde 2010."
            />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Telefone" htmlFor="phone" error={e.phone}>
              <Input id="phone" name="phone" inputMode="tel" defaultValue={store.phone ?? ""} />
            </Field>
            <Field label="WhatsApp" htmlFor="whatsapp" error={e.whatsapp}>
              <Input id="whatsapp" name="whatsapp" inputMode="tel" defaultValue={store.whatsapp ?? ""} />
            </Field>
          </div>
          <div className="grid gap-5 sm:grid-cols-[1fr_8rem]">
            <Field label="Rua" htmlFor="address_street" error={e.address_street}>
              <Input id="address_street" name="address_street" defaultValue={store.address_street ?? ""} />
            </Field>
            <Field label="Número" htmlFor="address_number" error={e.address_number}>
              <Input id="address_number" name="address_number" defaultValue={store.address_number ?? ""} />
            </Field>
          </div>
          <div className="grid gap-5 sm:grid-cols-[1fr_1fr_6rem]">
            <Field label="Bairro" htmlFor="address_district" error={e.address_district}>
              <Input id="address_district" name="address_district" defaultValue={store.address_district ?? ""} />
            </Field>
            <Field label="Cidade" htmlFor="address_city" error={e.address_city}>
              <Input id="address_city" name="address_city" defaultValue={store.address_city ?? ""} />
            </Field>
            <Field label="UF" htmlFor="address_state" error={e.address_state}>
              <Input
                id="address_state"
                name="address_state"
                maxLength={2}
                className="uppercase"
                defaultValue={store.address_state ?? ""}
              />
            </Field>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Pedido mínimo (R$)" htmlFor="min_order" error={e.min_order} hint="Deixe vazio para não ter mínimo.">
              <Input
                id="min_order"
                name="min_order"
                inputMode="decimal"
                placeholder="0,00"
                defaultValue={centsToInput(store.min_order_cents)}
              />
            </Field>
            <Field
              label="Tempo médio de entrega (min)"
              htmlFor="prep_time_minutes"
              error={e.prep_time_minutes}
            >
              <Input
                id="prep_time_minutes"
                name="prep_time_minutes"
                type="number"
                min={5}
                max={240}
                defaultValue={store.prep_time_minutes}
              />
            </Field>
          </div>
          <Field label="Cor principal do site" error={e.primary_color}>
            <ColorPicker name="primary_color" defaultValue={store.primary_color} />
          </Field>
          <div>
            <Button type="submit" disabled={pending}>
              {pending ? "Salvando..." : "Salvar dados"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
function Switch({
  name,
  defaultChecked,
  title,
  description,
  children,
}: {
  name: string;
  defaultChecked: boolean;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="grid gap-3 rounded-xl border border-border p-4">
      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 size-4 shrink-0 accent-[var(--brand)]" />
        <span>
          <span className="block text-sm font-semibold">{title}</span>
          <span className="block text-sm text-muted-foreground">{description}</span>
        </span>
      </label>
      {children}
    </div>
  );
}

export type UpsellProduct = { id: string; name: string; category: string };

export function SiteSettingsForm({ store, products = [] }: { store: Store; products?: UpsellProduct[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateSiteSettings, {});
  const e = state.errors ?? {};
  return (
    <Card>
      <CardHeader>
        <CardTitle>Site e pedidos</CardTitle>
        <CardDescription>Pix pelo WhatsApp, agendamento, promoções, sugestões no carrinho, impressão e ferramentas de anúncio.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={keepValuesOnSubmit(action)} className="grid gap-4">
          <Feedback state={state} />
          <Switch
            name="pix_whatsapp_enabled"
            defaultChecked={store.pix_whatsapp_enabled}
            title="Pix pelo WhatsApp (sem integração com banco)"
            description="O cliente escolhe “Pix pelo WhatsApp”, envia o pedido e o site abre o WhatsApp da loja com o pedido pronto, pedindo a chave Pix. Você confere o comprovante e marca o pedido como pago no painel."
          >
            {store.whatsapp ? null : (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Cadastre o WhatsApp da loja em “Dados da loja” acima. Sem ele, essa opção não aparece no site.
              </p>
            )}
          </Switch>
          <Switch
            name="accepts_scheduled"
            defaultChecked={store.accepts_scheduled}
            title="Aceitar pedidos agendados"
            description="O cliente escolhe dia e horário para receber, dentro do seu horário de funcionamento. Com a loja fechada, o site continua recebendo agendamentos."
          >
            <Field label="Até quantos dias à frente" htmlFor="schedule_days_ahead" error={e.schedule_days_ahead}>
              <select
                id="schedule_days_ahead"
                name="schedule_days_ahead"
                defaultValue={store.schedule_days_ahead}
                className="h-11 max-w-56 rounded-xl border border-border bg-background px-3 text-sm"
              >
                <option value={0}>Só para hoje</option>
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <option key={n} value={n}>
                    {n === 1 ? "Hoje e amanhã" : `Até ${n} dias`}
                  </option>
                ))}
              </select>
            </Field>
          </Switch>
          <Switch
            name="show_promo_popup"
            defaultChecked={store.show_promo_popup}
            title="Mostrar janela de promoções no site"
            description="Quando o cliente abre o site, aparece uma janela com os produtos em promoção naquele momento (uma vez por visita)."
          />
          <Switch
            name="print_kitchen_copy"
            defaultChecked={store.print_kitchen_copy}
            title="Imprimir também a via da cozinha"
            description="O comprovante sai em duas vias: a do caixa, com preços, e a da cozinha, sem preços e com letra maior."
          />
          <Switch
            name="upsell_enabled"
            defaultChecked={store.upsell_enabled}
            title="Sugerir itens no carrinho"
            description="Na hora de finalizar, o site sugere até 3 produtos: primeiro os que você fixar abaixo, depois os que seus clientes costumam pedir juntos e, sem histórico, bebidas e acompanhamentos que ainda não estão no carrinho."
          >
            <div className="grid gap-3 sm:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Field key={i} label={`Sugestão fixa ${i + 1}`} htmlFor={`upsell_${i + 1}`}>
                  <select
                    id={`upsell_${i + 1}`}
                    name={`upsell_${i + 1}`}
                    defaultValue={store.upsell_product_ids[i] ?? ""}
                    className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                  >
                    <option value="">Automática</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.category})
                      </option>
                    ))}
                  </select>
                </Field>
              ))}
            </div>
          </Switch>
          <div className="grid gap-4 rounded-xl border border-border p-4">
            <div>
              <p className="text-sm font-semibold">Anúncios e métricas</p>
              <p className="text-sm text-muted-foreground">
                Cole só o código. O site registra visitas, produtos colocados no carrinho, início do checkout e pedidos feitos.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="ID do Facebook Pixel"
                htmlFor="facebook_pixel_id"
                error={e.facebook_pixel_id}
                hint="Gerenciador de Eventos da Meta > Fontes de dados."
              >
                <Input
                  id="facebook_pixel_id"
                  name="facebook_pixel_id"
                  inputMode="numeric"
                  placeholder="123456789012345"
                  defaultValue={store.facebook_pixel_id ?? ""}
                />
              </Field>
              <Field
                label="ID do Google Analytics"
                htmlFor="google_analytics_id"
                error={e.google_analytics_id}
                hint="Analytics > Administrador > Fluxos de dados."
              >
                <Input
                  id="google_analytics_id"
                  name="google_analytics_id"
                  placeholder="G-AB12CD34EF"
                  className="uppercase placeholder:normal-case"
                  defaultValue={store.google_analytics_id ?? ""}
                />
              </Field>
            </div>
          </div>
          <div>
            <Button type="submit" disabled={pending}>
              {pending ? "Salvando..." : "Salvar configurações"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
export function LogoForm({ store }: { store: Store }) {
  const [state, action, pending] = useActionState<FormState, FormData>(uploadLogo, {});
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Logo</CardTitle>
        <CardDescription>PNG, JPG ou WEBP de até 5 MB. Quadrado fica melhor.</CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={action} className="flex flex-wrap items-center gap-5">
          <div className="relative size-20 overflow-hidden rounded-2xl border border-border bg-muted">
            {store.logo_url ? (
              <Image src={store.logo_url} alt={`Logo ${store.name}`} fill sizes="80px" className="object-cover" />
            ) : (
              <div className="flex size-full items-center justify-center text-2xl font-bold text-muted-foreground">
                {store.name.slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
          <label
            className={cn(
              "inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-border px-5 text-sm font-semibold hover:bg-muted",
              pending && "pointer-events-none opacity-50",
            )}
          >
            <ImageUp className="size-4" />
            {pending ? "Enviando..." : store.logo_url ? "Trocar logo" : "Enviar logo"}
            <input
              type="file"
              name="logo"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={() => formRef.current?.requestSubmit()}
            />
          </label>
          <div className="w-full">
            <Feedback state={state} />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
type DayRow = { open: boolean; opens: string; closes: string };

export function HoursForm({ hours }: { hours: StoreHour[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveHours, {});
  const initial: DayRow[] = WEEKDAYS.map((_, weekday) => {
    const h = hours.find((x) => x.weekday === weekday);
    return h
      ? { open: true, opens: shortTime(h.opens_at), closes: shortTime(h.closes_at) }
      : { open: false, opens: "18:00", closes: "23:00" };
  });
  const [days, setDays] = useState(initial);
  const update = (i: number, patch: Partial<DayRow>) =>
    setDays((d) => d.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Horário de funcionamento</CardTitle>
        <CardDescription>
          Fora desse horário o site mostra a loja como fechada. Se fechar depois da meia-noite, é só colocar,
          por exemplo, 18:00 às 02:00.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-4">
          <Feedback state={state} />
          <div className="grid gap-2">
            {WEEKDAYS.map((label, i) => {
              const row = days[i];
              const err = state.errors?.[`day-${i}`];
              return (
                <div key={label} className="grid gap-1">
                  <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border px-3 py-2">
                    <label className="flex w-32 cursor-pointer items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        name={`open-${i}`}
                        checked={row.open}
                        onChange={(e) => update(i, { open: e.target.checked })}
                        className="size-4 accent-[var(--brand)]"
                      />
                      {label}
                    </label>
                    {row.open ? (
                      <div className="flex items-center gap-2 text-sm">
                        <Input
                          type="time"
                          name={`opens-${i}`}
                          value={row.opens}
                          onChange={(e) => update(i, { opens: e.target.value })}
                          className="h-9 w-28"
                          aria-label={`Abre ${label}`}
                        />
                        às
                        <Input
                          type="time"
                          name={`closes-${i}`}
                          value={row.closes}
                          onChange={(e) => update(i, { closes: e.target.value })}
                          className="h-9 w-28"
                          aria-label={`Fecha ${label}`}
                        />
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">Fechado</span>
                    )}
                  </div>
                  {err ? <p className="px-1 text-xs text-red-600">{err}</p> : null}
                </div>
              );
            })}
          </div>
          <div>
            <Button type="submit" disabled={pending}>
              {pending ? "Salvando..." : "Salvar horários"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
type ZoneRow = { key: number; neighborhood: string; fee: string; active: boolean; aliases: string; showAliases: boolean };

function isNotServed(fee: string) {
  const f = parseZoneFee(fee);
  return f.ok && !f.served;
}

export function ZonesForm({ zones }: { zones: DeliveryZone[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveZones, {});
  const nextKey = useRef(zones.length + 1);
  const listed = zones.filter((z) => !z.catch_all);
  const other = zones.find((z) => z.catch_all);
  const [rows, setRows] = useState<ZoneRow[]>(
    listed.map((z, i) => ({
      key: i,
      neighborhood: z.neighborhood,
      fee: feeInputFor(z),
      active: true,
      aliases: (z.aliases ?? []).join(", "),
      showAliases: (z.aliases ?? []).length > 0,
    })),
  );
  const [otherMode, setOtherMode] = useState<"none" | "fee">(other ? "fee" : "none");
  const [otherFee, setOtherFee] = useState(other ? centsToInput(other.fee_cents) : "");
  const [bulk, setBulk] = useState("");
  const [focusKey, setFocusKey] = useState<number | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);

  const update = (key: number, patch: Partial<ZoneRow>) =>
    setRows((r) => r.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const add = () => {
    const key = nextKey.current++;
    setRows((r) => [...r, { key, neighborhood: "", fee: "", active: true, aliases: "", showAliases: false }]);
    setFocusKey(key);
  };

  /** Cola uma lista "Bairro; 5,00; outro nome, outro nome" (uma por linha) de uma vez. */
  const importBulk = () => {
    const parsed = bulk
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, fee = "", aliases = ""] = line.split(/[;\t]|\s-\s|\s+R\$\s*/);
        return {
          key: nextKey.current++,
          neighborhood: name.trim(),
          fee: fee.replace(/R\$\s*/, "").trim(),
          active: true,
          aliases: aliases.trim(),
          showAliases: Boolean(aliases.trim()),
        };
      });
    setRows((r) => [...r, ...parsed]);
    setBulk("");
  };

  const payload = JSON.stringify({
    zones: rows.map(({ neighborhood, fee, active, aliases }) => ({ neighborhood, fee, active, aliases })),
    other_fee: otherMode === "fee" ? otherFee : null,
  });

  // Confere cada linha antes de salvar: uma taxa errada fazia o salvamento inteiro falhar
  // com o aviso lá no topo, longe do bairro (e o lojista achava que tinha salvo).
  const seenNames = new Map<string, number>();
  const problems = new Map<number, string>();
  for (const row of rows) {
    const name = row.neighborhood.trim();
    if (name.length < 2) problems.set(row.key, "Informe o nome do bairro.");
    else if (!parseZoneFee(row.fee).ok) {
      problems.set(row.key, `Taxa inválida. Use um valor (ex.: 5,00), deixe vazio (grátis) ou "${NOT_SERVED_LABEL}".`);
    } else {
      const key = name.toLocaleLowerCase("pt-BR");
      if (seenNames.has(key)) problems.set(row.key, "Esse bairro aparece duas vezes.");
      seenNames.set(key, row.key);
    }
  }
  const otherParsed = parseZoneFee(otherFee);
  const otherFeeOk = otherMode === "none" || (otherParsed.ok && otherParsed.served);
  const notServed = rows.filter((r) => isNotServed(r.fee)).length;

  // O que está salvo no banco x o que está na tela: avisa enquanto houver mudança sem salvar.
  const [savedPayload, setSavedPayload] = useState(payload);
  const [submitted, setSubmitted] = useState(payload);
  const [lastState, setLastState] = useState(state);
  if (state !== lastState) {
    setLastState(state);
    if (state.ok) setSavedPayload(submitted);
  }
  const dirty = payload !== savedPayload;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    setSubmitted(payload);
    setClientError(null);
    const first = rows.find((r) => problems.has(r.key));
    if (first) {
      e.preventDefault();
      setClientError(
        `Nada foi salvo. Corrija ${problems.size === 1 ? "a linha marcada" : `as ${problems.size} linhas marcadas`} em vermelho (primeira: "${first.neighborhood || "sem nome"}").`,
      );
      document.getElementById(`zone-${first.key}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    if (!otherFeeOk) {
      e.preventDefault();
      setClientError('Nada foi salvo. Informe a taxa de "Bairro que não está na lista" (ex.: 8,00).');
      return;
    }
  };
  // aviso do último salvamento só enquanto a tela é aquela que foi enviada
  const status = payload !== submitted ? null : clientError ? { message: clientError } : state;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bairros e taxas de entrega</CardTitle>
        <CardDescription>
          O cliente digita o CEP, o bairro aparece sozinho e a taxa é somada automaticamente.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <form action={action} onSubmit={onSubmit} className="grid gap-4">
          <input type="hidden" name="zones" value={payload} />
          <p className="text-xs text-muted-foreground">
            Taxa vazia = entrega grátis. Para um bairro que a loja não atende, escreva <strong>{NOT_SERVED_LABEL}</strong>{" "}
            na taxa.
          </p>
          {rows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              Nenhum bairro cadastrado.{" "}
              {otherMode === "fee"
                ? "Todos os endereços pagam a taxa de bairros fora da lista."
                : "Sem bairros, o cliente não consegue pedir com entrega."}
            </p>
          ) : (
            <div className="grid gap-2">
              <div className="hidden grid-cols-[1fr_9rem_2.5rem] gap-2 px-1 text-xs font-medium text-muted-foreground sm:grid">
                <span>Bairro</span>
                <span>Taxa (R$)</span>
                <span />
              </div>
              {rows.map((row) => (
                <div key={row.key} id={`zone-${row.key}`} className="grid scroll-mt-24 gap-1">
                  <div className="grid grid-cols-[1fr_7.5rem_2.5rem] items-center gap-2 sm:grid-cols-[1fr_9rem_2.5rem]">
                    <Input
                      value={row.neighborhood}
                      onChange={(e) => update(row.key, { neighborhood: e.target.value })}
                      placeholder="Nome do bairro"
                      autoFocus={row.key === focusKey}
                      aria-label="Bairro"
                      aria-invalid={problems.has(row.key) && row.neighborhood.trim().length < 2}
                      className={cn("h-10", problems.has(row.key) && row.neighborhood.trim().length < 2 && "border-red-500")}
                    />
                    <Input
                      value={row.fee}
                      onChange={(e) => update(row.key, { fee: e.target.value })}
                      placeholder="0,00"
                      aria-label={`Taxa de ${row.neighborhood || "bairro"}`}
                      aria-invalid={!parseZoneFee(row.fee).ok}
                      className={cn(
                        "h-10",
                        !parseZoneFee(row.fee).ok && "border-red-500",
                        isNotServed(row.fee) && "text-muted-foreground",
                      )}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remover ${row.neighborhood || "bairro"}`}
                      onClick={() => setRows((r) => r.filter((x) => x.key !== row.key))}
                    >
                      <Trash2 className="text-muted-foreground" />
                    </Button>
                  </div>
                  {problems.has(row.key) ? (
                    <p className="px-1 text-xs font-medium text-red-600">{problems.get(row.key)}</p>
                  ) : null}
                  {row.showAliases ? (
                    <label className="flex items-center gap-2 pl-1 text-xs text-muted-foreground">
                      <span className="shrink-0">Outros nomes:</span>
                      <Input
                        value={row.aliases}
                        onChange={(e) => update(row.key, { aliases: e.target.value })}
                        placeholder="separados por vírgula (ex.: Praia, Vila Praia)"
                        aria-label={`Outros nomes de ${row.neighborhood || "bairro"}`}
                        className="h-9 text-sm"
                      />
                    </label>
                  ) : (
                    <button
                      type="button"
                      onClick={() => update(row.key, { showAliases: true })}
                      className="justify-self-start px-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
                    >
                      + outros nomes deste bairro
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          <fieldset className="grid gap-2 rounded-xl border border-border px-4 py-3">
            <legend className="px-1 text-sm font-medium">Bairro que não está na lista</legend>
            <p className="text-xs text-muted-foreground">
              Quando o CEP do cliente cai num bairro que não está acima (nem nos outros nomes).
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="other_mode"
                checked={otherMode === "none"}
                onChange={() => setOtherMode("none")}
                className="size-4 accent-[var(--brand)]"
              />
              Não entregar (o cliente vê que a loja não atende o bairro)
            </label>
            <label className="flex flex-wrap items-center gap-2 text-sm">
              <input
                type="radio"
                name="other_mode"
                checked={otherMode === "fee"}
                onChange={() => setOtherMode("fee")}
                className="size-4 accent-[var(--brand)]"
              />
              Entregar com a taxa de R$
              <Input
                value={otherFee}
                onChange={(e) => {
                  setOtherFee(e.target.value);
                  setOtherMode("fee");
                }}
                placeholder="0,00"
                inputMode="decimal"
                aria-label="Taxa para bairros fora da lista"
                className="h-9 w-24"
              />
            </label>
          </fieldset>
          <Button type="button" variant="outline" onClick={add} className="justify-self-start">
            <Plus /> Adicionar bairro
          </Button>
          {/* Fica sempre visível no rodapé: com muitos bairros o aviso do salvamento aparecia longe. */}
          <div className="sticky bottom-0 z-10 -mx-4 grid gap-2 border-t border-border bg-card/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
            {status ? <Feedback state={status} /> : null}
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={pending}>
                {pending ? "Salvando..." : "Salvar bairros"}
              </Button>
              <span className={cn("text-sm", dirty ? "font-medium text-amber-700" : "text-muted-foreground")}>
                {dirty
                  ? "Alterações não salvas"
                  : `${rows.length} bairro(s)${notServed ? `, ${notServed} sem entrega` : ""}. Tudo salvo.`}
              </span>
            </div>
          </div>
        </form>

        <details className="rounded-xl bg-muted/60 px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium">Colar uma lista de bairros de uma vez</summary>
          <div className="mt-3 grid gap-2">
            <p className="text-muted-foreground">
              Um bairro por linha, com a taxa depois de ponto e vírgula. Outros nomes do bairro podem vir depois de
              outro ponto e vírgula. Ex.: Centro; 5,00; Praia, Vila Praia
            </p>
            <Textarea
              value={bulk}
              onChange={(e) => setBulk(e.target.value)}
              placeholder={"Centro; 5,00\nJardim América; 7,50\nPedreira; não atende"}
            />
            <div>
              <Button type="button" variant="secondary" size="sm" onClick={importBulk} disabled={!bulk.trim()}>
                Adicionar à lista
              </Button>
            </div>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
