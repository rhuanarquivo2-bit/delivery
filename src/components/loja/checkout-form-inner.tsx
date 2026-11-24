"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Banknote, ChevronLeft, CreditCard, Minus, Plus, QrCode, Store as StoreIcon, Bike } from "lucide-react";
import { placeOrder } from "@/app/loja/[slug]/actions";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { useCart } from "@/lib/cart";
import { changeDue, unitPrice } from "@/lib/pricing";
import type { Category } from "@/lib/types";
import { cn, formatBRL, parseBRLToCents } from "@/lib/utils";

type StoreInfo = { id: string; slug: string; name: string; min_order_cents: number; prep_time_minutes: number };
type Zone = { id: string; name: string; fee: number };
type Payment = "pix_delivery" | "card_delivery" | "cash";

const CUSTOMER_KEY = "cliente";

type SavedCustomer = {
  name?: string;
  phone?: string;
  street?: string;
  number?: string;
  complement?: string;
  reference?: string;
  zoneId?: string;
};

function loadCustomer(): SavedCustomer {
  try {
    return JSON.parse(window.localStorage.getItem(CUSTOMER_KEY) ?? "{}") as SavedCustomer;
  } catch {
    return {};
  }
}

function formatPhone(value: string) {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export default function CheckoutFormInner({
  store,
  open,
  zones,
  menu,
}: {
  store: StoreInfo;
  open: boolean;
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
  const [payment, setPayment] = useState<Payment | null>(null);
  const [needsChange, setNeedsChange] = useState(false);
  const [changeFor, setChangeFor] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Recalcula os preços com o cardápio atual (pode ter mudado desde que o item foi colocado).
  const lines = cart.lines.map((line) => {
    const category = menu.find((c) => c.id === line.categoryId);
    const price = category ? unitPrice(category, line.selection) : null;
    return { ...line, available: price !== null, unitPriceCents: price ?? line.unitPriceCents };
  });
  const unavailable = lines.filter((l) => !l.available);
  const subtotal = lines.filter((l) => l.available).reduce((n, l) => n + l.unitPriceCents * l.selection.quantity, 0);
  const zone = zones.find((z) => z.id === zoneId);
  const fee = fulfillment === "delivery" ? (zone?.fee ?? 0) : 0;
  const total = subtotal + fee;
  const belowMinimum = subtotal < store.min_order_cents;
  const changeCents = needsChange ? parseBRLToCents(changeFor) : null;
  const change = changeDue(total, changeCents);

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

  const submit = () => {
    setError(null);
    if (unavailable.length) return setError("Remova os itens indisponíveis do carrinho.");
    if (!payment) return setError("Escolha a forma de pagamento.");
    if (fulfillment === "delivery" && !zoneId) return setError("Escolha o bairro de entrega.");
    if (needsChange && (changeCents === null || changeCents <= total)) {
      return setError("O valor para troco precisa ser maior que o total.");
    }

    window.localStorage.setItem(
      CUSTOMER_KEY,
      JSON.stringify({ name, phone, street, number, complement, reference, zoneId } satisfies SavedCustomer),
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
        delivery_zone_id: zoneId,
        payment_method: payment,
        change_for: needsChange ? changeFor : "",
        notes,
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
        {!open ? <Alert tone="error">A loja está fechada agora e não está recebendo pedidos.</Alert> : null}

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
                    <p className="mt-1 text-sm font-semibold">{formatBRL(line.unitPriceCents * line.selection.quantity)}</p>
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

        <Block title="Seus dados">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome" htmlFor="name">
              <Input id="name" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Celular (WhatsApp)" htmlFor="phone">
              <Input
                id="phone"
                type="tel"
                autoComplete="tel-national"
                required
                placeholder="(11) 99999-9999"
                value={phone}
                onChange={(e) => setPhone(formatPhone(e.target.value))}
              />
            </Field>
          </div>
        </Block>

        {fulfillment === "delivery" ? (
          <Block title="Endereço de entrega">
            <div className="grid gap-4">
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

        <Block title="Pagamento na entrega" subtitle="Você paga quando receber o pedido.">
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

        <Block title="Resumo">
          <dl className="grid gap-1.5 text-sm">
            <Row label="Subtotal" value={formatBRL(subtotal)} />
            {fulfillment === "delivery" ? (
              <Row label="Taxa de entrega" value={zone ? (fee ? formatBRL(fee) : "Grátis") : "Escolha o bairro"} />
            ) : null}
            <Row label="Total" value={formatBRL(total)} strong />
          </dl>
          {belowMinimum ? (
            <p className="mt-3 text-sm text-red-600">
              Pedido mínimo de {formatBRL(store.min_order_cents)}. Faltam {formatBRL(store.min_order_cents - subtotal)}.
            </p>
          ) : null}
          <p className="mt-3 text-xs text-muted-foreground">
            Tempo médio: {store.prep_time_minutes} minutos{fulfillment === "pickup" ? " para retirada" : ""}.
          </p>
        </Block>

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 p-3 backdrop-blur sm:p-4">
          <Button
            type="submit"
            size="lg"
            className="mx-auto flex h-14 w-full max-w-2xl justify-between rounded-2xl text-base"
            disabled={pending || !open || belowMinimum}
          >
            <span>{pending ? "Enviando pedido..." : "Enviar pedido"}</span>
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

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("flex justify-between", strong && "border-t border-border pt-2 text-base font-bold")}>
      <dt className={cn(!strong && "text-muted-foreground")}>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
