"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Banknote,
  Bike,
  CalendarClock,
  ChevronLeft,
  CreditCard,
  Loader2,
  Minus,
  Plus,
  QrCode,
  Store as StoreIcon,
  Ticket,
  Timer,
  UserCheck,
  X,
  Zap,
} from "lucide-react";
import { checkCoupon, lookupCustomer, placeOrder } from "@/app/loja/[slug]/actions";
import { CartSuggestions } from "@/components/loja/cart-suggestions";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { useCart } from "@/lib/cart";
import { rememberOrders } from "@/lib/my-orders";
import { formatCep, lookupCep, matchZone } from "@/lib/cep";
import { formatCpf, isValidDocument } from "@/lib/document";
import { changeDue, couponDiscount, couponLabel, unitPrice, type AppliedCoupon } from "@/lib/pricing";
import { scheduleOptions } from "@/lib/schedule";
import { trackAddToCart, trackBeginCheckout } from "@/lib/tracking";
import type { Category, StoreHour } from "@/lib/types";
import { cn, formatBRL, formatPhone, parseBRLToCents } from "@/lib/utils";

type StoreInfo = {
  id: string;
  slug: string;
  name: string;
  min_order_cents: number;
  prep_time_minutes: number;
  pix_provider: "mercadopago" | "asaas" | "demo" | null;
  open_override: boolean | null;
  accepts_scheduled: boolean;
  schedule_days_ahead: number;
};
type Zone = { id: string; name: string; fee: number };
type Payment = "pix_online" | "pix_delivery" | "card_delivery" | "cash";

const CUSTOMER_KEY = "cliente";

type SavedCustomer = {
  name?: string;
  phone?: string;
  street?: string;
  number?: string;
  complement?: string;
  reference?: string;
  zoneId?: string;
  cep?: string;
};

function loadCustomer(): SavedCustomer {
  try {
    return JSON.parse(window.localStorage.getItem(CUSTOMER_KEY) ?? "{}") as SavedCustomer;
  } catch {
    return {};
  }
}

export default function CheckoutFormInner({
  store,
  open,
  hours,
  zones,
  menu,
}: {
  store: StoreInfo;
  open: boolean;
  hours: StoreHour[];
  zones: Zone[];
  menu: Category[];
}) {
  const router = useRouter();
  const cart = useCart(store.slug);
  const [saved] = useState(loadCustomer);
  const [fulfillment, setFulfillment] = useState<"delivery" | "pickup">(zones.length ? "delivery" : "pickup");
  const [name, setName] = useState(saved.name ?? "");
  const [phone, setPhone] = useState(formatPhone(saved.phone ?? ""));
  const [zoneId, setZoneId] = useState(zones.some((z) => z.id === saved.zoneId) ? saved.zoneId! : "");
  const [street, setStreet] = useState(saved.street ?? "");
  const [number, setNumber] = useState(saved.number ?? "");
  const [complement, setComplement] = useState(saved.complement ?? "");
  const [reference, setReference] = useState(saved.reference ?? "");
  const [cep, setCep] = useState(formatCep(saved.cep ?? ""));
  const [cepStatus, setCepStatus] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const [cepLoading, setCepLoading] = useState(false);
  const cepAbort = useRef<AbortController | null>(null);
  // Horários para agendar: recalcula a cada minuto (o primeiro horário anda com o relógio).
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setClock(Date.now()), 60000);
    return () => window.clearInterval(t);
  }, []);
  const scheduleDays = useMemo(
    () =>
      store.accepts_scheduled
        ? scheduleOptions({
            hours,
            override: store.open_override,
            prepMinutes: store.prep_time_minutes,
            daysAhead: store.schedule_days_ahead,
            now: new Date(clock),
          })
        : [],
    [store, hours, clock],
  );
  const canSchedule = scheduleDays.length > 0;
  const [when, setWhen] = useState<"now" | "later">(open ? "now" : "later");
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleSlot, setScheduleSlot] = useState("");
  const scheduling = when === "later" && canSchedule;
  const scheduleDay = scheduleDays.find((d) => d.date === scheduleDate) ?? scheduleDays[0];
  const slot = scheduleDay?.slots.find((s) => s.value === scheduleSlot) ?? null;
  const canSubmitNow = scheduling ? slot !== null : open;
  const [payment, setPayment] = useState<Payment | null>(null);
  const [needsChange, setNeedsChange] = useState(false);
  const [changeFor, setChangeFor] = useState("");
  const [notes, setNotes] = useState("");
  const [cpf, setCpf] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<AppliedCoupon | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [checkingCoupon, startCouponCheck] = useTransition();

  // Recalcula os preços com o cardápio atual (pode ter mudado desde que o item foi colocado).
  const lines = cart.lines.map((line) => {
    const category = menu.find((c) => c.id === line.categoryId);
    const price = category ? unitPrice(category, line.selection) : null;
    const full = category ? unitPrice(category, line.selection, { withPromos: false }) : null;
    return {
      ...line,
      available: price !== null,
      unitPriceCents: price ?? line.unitPriceCents,
      fullUnitPriceCents: full !== null && price !== null && full > price ? full : null,
    };
  });
  const unavailable = lines.filter((l) => !l.available);
  const subtotal = lines.filter((l) => l.available).reduce((n, l) => n + l.unitPriceCents * l.selection.quantity, 0);
  const zone = zones.find((z) => z.id === zoneId);
  const fee = fulfillment === "delivery" ? (zone?.fee ?? 0) : 0;
  const promoSavings = lines
    .filter((l) => l.available && l.fullUnitPriceCents !== null)
    .reduce((n, l) => n + (l.fullUnitPriceCents! - l.unitPriceCents) * l.selection.quantity, 0);
  // cupom de entrega grátis não vale para retirada
  const couponUsable = coupon && !(coupon.kind === "free_delivery" && fulfillment === "pickup") ? coupon : null;
  const discount = couponUsable ? couponDiscount(couponUsable, subtotal, fee) : null;
  const total = Math.max(subtotal + fee - (discount ?? 0), 0);
  const belowMinimum = subtotal < store.min_order_cents;
  const needsCpf = payment === "pix_online" && store.pix_provider === "asaas";
  const changeCents = needsChange ? parseBRLToCents(changeFor) : null;
  const change = changeDue(total, changeCents);

  // Cliente que já pediu: ao completar o celular, puxa nome e endereço do último pedido.
  const [welcome, setWelcome] = useState<{ name: string; orders: number } | null>(null);
  const lookedUp = useRef("");
  const zonesRef = useRef(zones);
  useEffect(() => {
    zonesRef.current = zones;
  }, [zones]);
  const phoneDigits = phone.replace(/\D/g, "");
  useEffect(() => {
    if (phoneDigits.length < 10 || lookedUp.current === phoneDigits) return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      lookedUp.current = phoneDigits;
      lookupCustomer(store.id, phoneDigits)
        .then((found) => {
          if (cancelled || !found) return;
          setName(found.name);
          if (found.street) {
            setStreet(found.street);
            setNumber(found.number ?? "");
            setComplement(found.complement ?? "");
            setReference(found.reference ?? "");
            setCep(formatCep(found.cep ?? ""));
            if (found.zoneId && zonesRef.current.some((z) => z.id === found.zoneId)) setZoneId(found.zoneId);
          }
          setWelcome({ name: found.name.split(" ")[0], orders: found.orders });
        })
        .catch(() => {
          lookedUp.current = "";
        });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [phoneDigits, store.id]);

  // Marketing da loja (Pixel/Analytics): uma vez ao abrir o checkout.
  const tracked = useRef(false);
  useEffect(() => {
    if (tracked.current || cart.lines.length === 0) return;
    tracked.current = true;
    trackBeginCheckout(subtotal, cart.lines.length);
  }, [cart.lines.length, subtotal]);

  const fillFromCep = (value: string) => {
    const digits = value.replace(/\D/g, "");
    setCepStatus(null);
    cepAbort.current?.abort();
    if (digits.length !== 8) return;
    const controller = new AbortController();
    cepAbort.current = controller;
    setCepLoading(true);
    lookupCep(digits, controller.signal)
      .then((found) => {
        if (!found) return setCepStatus({ tone: "error", text: "CEP não encontrado. Preencha o endereço abaixo." });
        if (found.street) setStreet(found.street);
        const match = found.district ? matchZone(zones, found.district) : null;
        if (match) {
          setZoneId(match.id);
          setCepStatus({ tone: "info", text: `${found.street ? `${found.street} · ` : ""}${match.name}` });
        } else {
          setCepStatus({
            tone: "info",
            text: found.district
              ? `Bairro ${found.district}: escolha na lista o bairro de entrega mais próximo.`
              : "Escolha o bairro de entrega na lista.",
          });
        }
        if (found.street) window.setTimeout(() => document.getElementById("number")?.focus(), 0);
      })
      .catch((err: unknown) => {
        if ((err as Error)?.name !== "AbortError") {
          setCepStatus({ tone: "error", text: "Não deu para buscar o CEP agora. Preencha o endereço abaixo." });
        }
      })
      .finally(() => {
        if (cepAbort.current === controller) setCepLoading(false);
      });
  };

  if (cart.lines.length === 0) {
    return (
      <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-4 px-6 py-20 text-center">
        <h1 className="text-2xl font-bold">Seu carrinho está vazio</h1>
        <p className="text-muted-foreground">Escolha seus itens no cardápio da {store.name}.</p>
        <Link href={`/loja/${store.slug}`} className={buttonVariants()}>
          Ver cardápio
        </Link>
      </main>
    );
  }

  const applyCoupon = () => {
    setCouponError(null);
    const available = lines.filter((l) => l.available);
    startCouponCheck(async () => {
      const result = await checkCoupon({
        store_id: store.id,
        coupon_code: couponInput,
        fulfillment,
        delivery_zone_id: zoneId,
        customer_phone: phone,
        items: available.map((l) => ({
          product_id: l.selection.productId,
          size_id: l.selection.sizeId,
          flavor_ids: l.selection.flavorIds,
          option_ids: l.selection.optionIds,
          quantity: l.selection.quantity,
          notes: l.selection.notes,
        })),
      });
      if (!result.ok) return setCouponError(result.message);
      setCoupon(result.coupon);
      setCouponInput("");
    });
  };

  const submit = () => {
    setError(null);
    if (unavailable.length) return setError("Remova os itens indisponíveis do carrinho.");
    if (!payment) return setError("Escolha a forma de pagamento.");
    if (needsCpf && !isValidDocument(cpf)) return setError("Informe um CPF válido para pagar com Pix.");
    if (fulfillment === "delivery" && !zoneId) return setError("Escolha o bairro de entrega.");
    if (scheduling && !slot) return setError("Escolha o dia e o horário do agendamento.");
    if (!scheduling && !open) return setError("A loja está fechada agora. Agende o pedido para outro horário.");
    if (needsChange && (changeCents === null || changeCents <= total)) {
      return setError("O valor para troco precisa ser maior que o total.");
    }

    window.localStorage.setItem(
      CUSTOMER_KEY,
      JSON.stringify({ name, phone, street, number, complement, reference, zoneId, cep } satisfies SavedCustomer),
    );

    startTransition(async () => {
      const result = await placeOrder({
        store_id: store.id,
        fulfillment,
        customer_name: name,
        customer_phone: phone,
        address_street: street,
        address_number: number,
        address_complement: complement,
        address_reference: reference,
        address_zip: cep,
        delivery_zone_id: zoneId,
        scheduled_for: scheduling && slot ? slot.value : "",
        payment_method: payment,
        customer_document: needsCpf ? cpf : "",
        change_for: needsChange ? changeFor : "",
        notes,
        // cupom abaixo do valor mínimo dele não vai (o resumo já avisa)
        coupon_code: couponUsable && discount !== null ? couponUsable.code : "",
        items: lines.map((l) => ({
          product_id: l.selection.productId,
          size_id: l.selection.sizeId,
          flavor_ids: l.selection.flavorIds,
          option_ids: l.selection.optionIds,
          quantity: l.selection.quantity,
          notes: l.selection.notes,
        })),
      });
      if (!result.ok) {
        setError(result.message);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      cart.clear();
      rememberOrders(store.slug, [result.token]);
      router.push(`/loja/${store.slug}/pedido/${result.token}`);
    });
  };

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-32 pt-6">
      <Link
        href={`/loja/${store.slug}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Continuar comprando
      </Link>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">Finalizar pedido</h1>
      <p className="text-sm text-muted-foreground">{store.name}</p>

      <form
        className="mt-6 grid gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {error ? <Alert tone="error">{error}</Alert> : null}
        {!open ? (
          canSchedule ? (
            <Alert tone="info">A loja está fechada agora, mas você pode agendar o pedido para um dos horários abaixo.</Alert>
          ) : (
            <Alert tone="error">A loja está fechada agora e não está recebendo pedidos.</Alert>
          )
        ) : null}

        <Block title="Seu pedido">
          <ul className="divide-y divide-border">
            {lines.map((line) => (
              <li key={line.key} className={cn("flex gap-3 py-3", !line.available && "opacity-60")}>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{line.title}</p>
                  {line.details.map((d) => (
                    <p key={d} className="text-xs text-muted-foreground">
                      {d}
                    </p>
                  ))}
                  {line.available ? (
                    <p className="mt-1 text-sm font-semibold">
                      {line.fullUnitPriceCents !== null ? (
                        <span className="mr-1.5 font-normal text-muted-foreground line-through">
                          {formatBRL(line.fullUnitPriceCents * line.selection.quantity)}
                        </span>
                      ) : null}
                      {formatBRL(line.unitPriceCents * line.selection.quantity)}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs font-semibold text-red-600">Indisponível no momento</p>
                  )}
                </div>
                <div className="flex h-9 items-center self-center rounded-xl border border-border">
                  <button
                    type="button"
                    className="flex size-9 cursor-pointer items-center justify-center"
                    aria-label="Diminuir"
                    onClick={() => cart.setQuantity(line.key, line.selection.quantity - 1)}
                  >
                    <Minus className="size-3.5" />
                  </button>
                  <span className="w-5 text-center text-sm font-semibold">{line.selection.quantity}</span>
                  <button
                    type="button"
                    className="flex size-9 cursor-pointer items-center justify-center disabled:opacity-40"
                    aria-label="Aumentar"
                    disabled={!line.available}
                    onClick={() => cart.setQuantity(line.key, Math.min(50, line.selection.quantity + 1))}
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Block>

        <CartSuggestions
          storeId={store.id}
          menu={menu}
          cartProductIds={cart.lines.map((l) => l.selection.productId)}
          canOrder={open || store.accepts_scheduled}
          onAdd={(line) => {
            cart.add(line);
            trackAddToCart({
              id: line.selection.productId,
              name: line.title,
              price_cents: line.unitPriceCents,
              quantity: line.selection.quantity,
            });
          }}
        />

        <Block title="Como você quer receber?">
          <div className="grid grid-cols-2 gap-3">
            <Option
              selected={fulfillment === "delivery"}
              onClick={() => setFulfillment("delivery")}
              icon={<Bike className="size-5" />}
              label="Entrega"
              disabled={zones.length === 0}
            />
            <Option
              selected={fulfillment === "pickup"}
              onClick={() => setFulfillment("pickup")}
              icon={<StoreIcon className="size-5" />}
              label="Retirar na loja"
            />
          </div>
        </Block>

        {canSchedule ? (
          <Block title="Quando você quer receber?">
            <div className="grid grid-cols-2 gap-3">
              <Option
                selected={when === "now"}
                onClick={() => setWhen("now")}
                icon={<Timer className="size-5" />}
                label="Agora"
                hint={open ? `Em cerca de ${store.prep_time_minutes} min` : "Loja fechada agora"}
                disabled={!open}
              />
              <Option
                selected={when === "later"}
                onClick={() => setWhen("later")}
                icon={<CalendarClock className="size-5" />}
                label="Agendar"
                hint="Escolha dia e horário"
              />
            </div>
            {scheduling && scheduleDay ? (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Dia" htmlFor="schedule-day">
                  <select
                    id="schedule-day"
                    value={scheduleDay.date}
                    onChange={(e) => {
                      setScheduleDate(e.target.value);
                      setScheduleSlot("");
                    }}
                    className="h-11 rounded-xl border border-border bg-background px-3 text-sm"
                  >
                    {scheduleDays.map((d) => (
                      <option key={d.date} value={d.date}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={fulfillment === "pickup" ? "Retirar às" : "Receber às"} htmlFor="schedule-slot">
                  <select
                    id="schedule-slot"
                    value={slot?.value ?? ""}
                    onChange={(e) => setScheduleSlot(e.target.value)}
                    className="h-11 rounded-xl border border-border bg-background px-3 text-sm"
                  >
                    <option value="">Escolha o horário</option>
                    {scheduleDay.slots.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            ) : null}
          </Block>
        ) : null}

        <Block title="Seus dados" subtitle="Já pediu aqui? Digite seu celular e a gente preenche o resto.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Celular (WhatsApp)" htmlFor="phone">
              <Input
                id="phone"
                type="tel"
                autoComplete="tel-national"
                required
                placeholder="(11) 99999-9999"
                value={phone}
                onChange={(e) => {
                  setPhone(formatPhone(e.target.value));
                  setWelcome(null);
                }}
              />
            </Field>
            <Field label="Nome" htmlFor="name">
              <Input id="name" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          </div>
          {welcome ? (
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <UserCheck className="mt-0.5 size-4 shrink-0" />
              <span>
                Que bom te ver de novo, <strong>{welcome.name}</strong>! Preenchemos seus dados do último pedido. Confira
                o endereço antes de finalizar.
              </span>
            </p>
          ) : null}
        </Block>

        {fulfillment === "delivery" ? (
          <Block title="Endereço de entrega">
            <div className="grid gap-4">
              <Field label="CEP (opcional)" htmlFor="cep" hint="Preenche a rua e o bairro sozinho.">
                <div className="relative max-w-48">
                  <Input
                    id="cep"
                    inputMode="numeric"
                    autoComplete="postal-code"
                    placeholder="00000-000"
                    value={cep}
                    onChange={(e) => {
                      const value = formatCep(e.target.value);
                      setCep(value);
                      fillFromCep(value);
                    }}
                  />
                  {cepLoading ? (
                    <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                  ) : null}
                </div>
              </Field>
              {cepStatus ? (
                <p className={cn("-mt-2 text-sm", cepStatus.tone === "error" ? "text-red-600" : "text-muted-foreground")}>
                  {cepStatus.text}
                </p>
              ) : null}
              <Field label="Bairro" htmlFor="zone">
                <select
                  id="zone"
                  required
                  value={zoneId}
                  onChange={(e) => setZoneId(e.target.value)}
                  className="h-11 rounded-xl border border-border bg-background px-3 text-sm"
                >
                  <option value="">Selecione o bairro</option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name} · {z.fee ? formatBRL(z.fee) : "entrega grátis"}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
                <Field label="Rua" htmlFor="street">
                  <Input
                    id="street"
                    autoComplete="address-line1"
                    required
                    value={street}
                    onChange={(e) => setStreet(e.target.value)}
                  />
                </Field>
                <Field label="Número" htmlFor="number">
                  <Input id="number" required value={number} onChange={(e) => setNumber(e.target.value)} />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Complemento (opcional)" htmlFor="complement">
                  <Input
                    id="complement"
                    placeholder="Apto, bloco..."
                    value={complement}
                    onChange={(e) => setComplement(e.target.value)}
                  />
                </Field>
                <Field label="Ponto de referência (opcional)" htmlFor="reference">
                  <Input id="reference" value={reference} onChange={(e) => setReference(e.target.value)} />
                </Field>
              </div>
            </div>
          </Block>
        ) : null}

        <Block
          title={store.pix_provider ? "Pagamento" : "Pagamento na entrega"}
          subtitle={store.pix_provider ? undefined : "Você paga quando receber o pedido."}
        >
          {store.pix_provider ? (
            <div className="mb-4 grid gap-3">
              <Option
                selected={payment === "pix_online"}
                onClick={() => {
                  setPayment("pix_online");
                  setNeedsChange(false);
                }}
                icon={<Zap className="size-5" />}
                label="Pagar agora com Pix"
                hint="Você paga pelo app do banco e o pedido segue na hora"
              />
              {needsCpf ? (
                <Field label="CPF de quem vai pagar" htmlFor="cpf" hint="O banco pede o CPF para gerar o Pix.">
                  <Input
                    id="cpf"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="000.000.000-00"
                    className="max-w-56"
                    value={cpf}
                    onChange={(e) => setCpf(formatCpf(e.target.value))}
                  />
                </Field>
              ) : null}
              <p className="pt-1 text-sm font-medium text-muted-foreground">Ou pague na entrega</p>
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-3">
            <Option
              selected={payment === "pix_delivery"}
              onClick={() => setPayment("pix_delivery")}
              icon={<QrCode className="size-5" />}
              label="Pix"
            />
            <Option
              selected={payment === "card_delivery"}
              onClick={() => setPayment("card_delivery")}
              icon={<CreditCard className="size-5" />}
              label="Cartão"
              hint="Crédito ou débito"
            />
            <Option
              selected={payment === "cash"}
              onClick={() => setPayment("cash")}
              icon={<Banknote className="size-5" />}
              label="Dinheiro"
            />
          </div>
          {payment === "cash" ? (
            <div className="mt-4 grid gap-3 rounded-xl bg-muted/60 p-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={needsChange}
                  onChange={(e) => setNeedsChange(e.target.checked)}
                  className="size-4 accent-[var(--brand)]"
                />
                Preciso de troco
              </label>
              {needsChange ? (
                <div className="flex flex-wrap items-end gap-3">
                  <Field label="Troco para quanto?" htmlFor="changeFor">
                    <Input
                      id="changeFor"
                      inputMode="decimal"
                      placeholder="Ex.: 100,00"
                      className="w-40"
                      value={changeFor}
                      onChange={(e) => setChangeFor(e.target.value)}
                    />
                  </Field>
                  {change !== null ? (
                    <p className="pb-3 text-sm">
                      Seu troco: <strong>{formatBRL(change)}</strong>
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </Block>

        <Block title="Observações (opcional)">
          <Textarea
            maxLength={300}
            className="min-h-16"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ex.: interfone com defeito, me ligue ao chegar."
          />
        </Block>

        <Block title="Cupom de desconto">
          {coupon ? (
            <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
              <Ticket className="size-5 shrink-0 text-emerald-700" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-emerald-800">
                  {coupon.code} · {couponLabel(coupon, formatBRL)}
                </p>
                {coupon.description ? <p className="text-emerald-800/80">{coupon.description}</p> : null}
                {coupon !== couponUsable ? (
                  <p className="text-amber-700">Vale só para entrega.</p>
                ) : discount === null ? (
                  <p className="text-amber-700">Vale para pedidos a partir de {formatBRL(coupon.min_order_cents)}.</p>
                ) : null}
              </div>
              <button
                type="button"
                className="cursor-pointer rounded-lg p-1.5 text-emerald-800 hover:bg-emerald-100"
                aria-label="Remover cupom"
                onClick={() => setCoupon(null)}
              >
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                aria-label="Código do cupom"
                placeholder="Digite o código"
                className="uppercase placeholder:normal-case"
                maxLength={20}
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value.toUpperCase().replace(/\s/g, ""))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (couponInput) applyCoupon();
                  }
                }}
              />
              <Button type="button" variant="outline" disabled={!couponInput || checkingCoupon} onClick={applyCoupon}>
                {checkingCoupon ? "Conferindo..." : "Aplicar"}
              </Button>
            </div>
          )}
          {couponError ? <p className="mt-2 text-sm text-red-600">{couponError}</p> : null}
        </Block>

        <Block title="Resumo">
          <dl className="grid gap-1.5 text-sm">
            <Row label="Subtotal" value={formatBRL(subtotal)} />
            {fulfillment === "delivery" ? (
              <Row label="Taxa de entrega" value={zone ? (fee ? formatBRL(fee) : "Grátis") : "Escolha o bairro"} />
            ) : null}
            {discount ? <Row label={`Cupom ${couponUsable!.code}`} value={`- ${formatBRL(discount)}`} tone="success" /> : null}
            <Row label="Total" value={formatBRL(total)} strong />
          </dl>
          {promoSavings > 0 || discount ? (
            <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
              Você está economizando {formatBRL(promoSavings + (discount ?? 0))} neste pedido.
            </p>
          ) : null}
          {belowMinimum ? (
            <p className="mt-3 text-sm text-red-600">
              Pedido mínimo de {formatBRL(store.min_order_cents)}. Faltam {formatBRL(store.min_order_cents - subtotal)}.
            </p>
          ) : null}
          <p className="mt-3 text-xs text-muted-foreground">
            {scheduling && slot
              ? `Agendado para ${scheduleDay!.label === "Hoje" || scheduleDay!.label === "Amanhã" ? scheduleDay!.label.toLowerCase() : scheduleDay!.label} às ${slot.label}.`
              : `Tempo médio: ${store.prep_time_minutes} minutos${fulfillment === "pickup" ? " para retirada" : ""}.`}
          </p>
        </Block>

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 p-3 backdrop-blur sm:p-4">
          <Button
            type="submit"
            size="lg"
            className="mx-auto flex h-14 w-full max-w-2xl justify-between rounded-2xl text-base"
            disabled={pending || !canSubmitNow || belowMinimum}
          >
            <span>
              {pending
                ? payment === "pix_online"
                  ? "Gerando o Pix..."
                  : "Enviando pedido..."
                : payment === "pix_online"
                  ? "Pagar com Pix"
                  : scheduling
                    ? "Agendar pedido"
                    : "Enviar pedido"}
            </span>
            <span>{formatBRL(total)}</span>
          </Button>
        </div>
      </form>
    </main>
  );
}

function Block({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="font-semibold">{title}</h2>
      {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Option({
  selected,
  onClick,
  icon,
  label,
  hint,
  disabled,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        selected ? "border-brand bg-brand/5 ring-2 ring-brand/20" : "border-border hover:bg-muted",
      )}
    >
      <span className={cn(selected ? "text-brand" : "text-muted-foreground")}>{icon}</span>
      <span>
        <span className="block font-semibold">{label}</span>
        {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      </span>
    </button>
  );
}

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "success" }) {
  return (
    <div
      className={cn(
        "flex justify-between",
        strong && "border-t border-border pt-2 text-base font-bold",
        tone === "success" && "text-emerald-700",
      )}
    >
      <dt className={cn(!strong && !tone && "text-muted-foreground")}>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
