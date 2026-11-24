"use client";

import Image from "next/image";
import { useActionState, useRef, useState } from "react";
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
import { cn, formatBRL } from "@/lib/utils";
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

export function SiteSettingsForm({ store }: { store: Store }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateSiteSettings, {});
  const e = state.errors ?? {};
  return (
    <Card>
      <CardHeader>
        <CardTitle>Site e pedidos</CardTitle>
        <CardDescription>Agendamento, promoções, impressão e ferramentas de anúncio.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={keepValuesOnSubmit(action)} className="grid gap-4">
          <Feedback state={state} />
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
type ZoneRow = { key: number; neighborhood: string; fee: string; active: boolean };

export function ZonesForm({ zones }: { zones: DeliveryZone[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveZones, {});
  const nextKey = useRef(zones.length + 1);
  const [rows, setRows] = useState<ZoneRow[]>(
    zones.map((z, i) => ({ key: i, neighborhood: z.neighborhood, fee: centsToInput(z.fee_cents), active: z.active })),
  );
  const [bulk, setBulk] = useState("");
  const [focusKey, setFocusKey] = useState<number | null>(null);

  const update = (key: number, patch: Partial<ZoneRow>) =>
    setRows((r) => r.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const add = () => {
    const key = nextKey.current++;
    setRows((r) => [...r, { key, neighborhood: "", fee: "", active: true }]);
    setFocusKey(key);
  };

  /** Cola uma lista "Bairro; 5,00" (uma por linha) de uma vez. */
  const importBulk = () => {
    const parsed = bulk
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, fee = ""] = line.split(/[;\t]|\s-\s|\s+R\$\s*/);
        return { key: nextKey.current++, neighborhood: name.trim(), fee: fee.replace(/R\$\s*/, "").trim(), active: true };
      });
    setRows((r) => [...r, ...parsed]);
    setBulk("");
  };

  const payload = JSON.stringify(rows.map(({ neighborhood, fee, active }) => ({ neighborhood, fee, active })));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bairros e taxas de entrega</CardTitle>
        <CardDescription>O cliente escolhe o bairro no pedido e a taxa é somada automaticamente.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <form action={action} className="grid gap-4">
          <input type="hidden" name="zones" value={payload} />
          <Feedback state={state} />
          {rows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              Nenhum bairro cadastrado. Sem bairros, o cliente não consegue escolher a entrega.
            </p>
          ) : (
            <div className="grid gap-2">
              <div className="hidden grid-cols-[1fr_8rem_5rem_2.5rem] gap-2 px-1 text-xs font-medium text-muted-foreground sm:grid">
                <span>Bairro</span>
                <span>Taxa (R$)</span>
                <span>Ativo</span>
                <span />
              </div>
              {rows.map((row) => (
                <div key={row.key} className="grid grid-cols-[1fr_6.5rem_2.5rem] items-center gap-2 sm:grid-cols-[1fr_8rem_5rem_2.5rem]">
                  <Input
                    value={row.neighborhood}
                    onChange={(e) => update(row.key, { neighborhood: e.target.value })}
                    placeholder="Nome do bairro"
                    autoFocus={row.key === focusKey}
                    aria-label="Bairro"
                    className="h-10"
                  />
                  <Input
                    value={row.fee}
                    onChange={(e) => update(row.key, { fee: e.target.value })}
                    placeholder="0,00"
                    inputMode="decimal"
                    aria-label="Taxa"
                    className="h-10"
                  />
                  <label className="hidden items-center gap-2 text-sm sm:flex">
                    <input
                      type="checkbox"
                      checked={row.active}
                      onChange={(e) => update(row.key, { active: e.target.checked })}
                      className="size-4 accent-[var(--brand)]"
                    />
                    {row.active ? "Sim" : "Não"}
                  </label>
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
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={add}>
              <Plus /> Adicionar bairro
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Salvando..." : "Salvar bairros"}
            </Button>
          </div>
        </form>

        <details className="rounded-xl bg-muted/60 px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium">Colar uma lista de bairros de uma vez</summary>
          <div className="mt-3 grid gap-2">
            <p className="text-muted-foreground">Um bairro por linha, com a taxa depois de ponto e vírgula. Ex.: Centro; 5,00</p>
            <Textarea value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={"Centro; 5,00\nJardim América; 7,50"} />
            <div>
              <Button type="button" variant="secondary" size="sm" onClick={importBulk} disabled={!bulk.trim()}>
                Adicionar à lista
              </Button>
            </div>
          </div>
        </details>
        {rows.length ? (
          <p className="text-xs text-muted-foreground">
            {rows.length} bairro(s). Lembre de salvar depois de alterar.
            {rows.some((r) => r.fee) ? "" : ` Taxa vazia significa entrega grátis (${formatBRL(0)}).`}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
