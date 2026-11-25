"use client";

import { useState, useTransition } from "react";
import { BadgeCheck, CalendarPlus, ExternalLink, FlaskConical, Lock, LockOpen, MessageCircle, Infinity as InfinityIcon, StickyNote, Trash2 } from "lucide-react";
import { deleteStore, extendStore, saveStoreNote, setStoreBlocked, setStorePaid, setStoreUntil, type AdminResult } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { daysLeftLabel, formatAccessDate, toDateInputBR, WARN_DAYS, whatsappLink, type AccessState } from "@/lib/access";
import type { AdminStore } from "@/lib/platform";
import { cn } from "@/lib/utils";

function StatusBadge({ access }: { access: AccessState }) {
  const [label, tone] = (() => {
    switch (access.kind) {
      case "blocked":
        return ["Bloqueada", "bg-red-50 text-red-700 border-red-200"];
      case "expired":
        return [`Vencida em ${formatAccessDate(access.until)}`, "bg-amber-50 text-amber-800 border-amber-200"];
      case "unlimited":
        return ["Liberada sem prazo", "bg-emerald-50 text-emerald-700 border-emerald-200"];
      case "active":
        return [
          `Até ${formatAccessDate(access.until)} · vence ${daysLeftLabel(access.daysLeft)}`,
          access.daysLeft <= WARN_DAYS
            ? "bg-amber-50 text-amber-800 border-amber-200"
            : "bg-emerald-50 text-emerald-700 border-emerald-200",
        ];
      default:
        return ["Demonstração", "bg-muted text-muted-foreground border-border"];
    }
  })();
  return <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold", tone)}>{label}</span>;
}

function PlanBadge({ paid }: { paid: boolean }) {
  return paid ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white">
      <BadgeCheck className="size-3.5" /> Pagante
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 ring-1 ring-sky-200">
      <FlaskConical className="size-3.5" /> Teste grátis
    </span>
  );
}

const fmtDate = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short" }).format(new Date(iso)) : "—";

export function StoreAccessCard({ store, access, siteHref }: { store: AdminStore; access: AccessState; siteHref: string }) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<AdminResult | null>(null);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(toDateInputBR(store.access_until));
  const [reason, setReason] = useState(store.blocked_reason ?? "");
  const [note, setNote] = useState(store.note ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [typedSlug, setTypedSlug] = useState("");

  const act = (fn: () => Promise<AdminResult>, done: string) =>
    startTransition(async () => {
      const r = await fn();
      setFeedback(r.ok ? { ok: true, message: done } : r);
      window.setTimeout(() => setFeedback(null), 4000);
    });

  const contact = whatsappLink(store.whatsapp ?? store.phone);

  return (
    <div className={cn("rounded-2xl border bg-card p-4 sm:p-5", access.kind === "blocked" ? "border-red-200" : "border-border")}>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-base font-semibold">{store.name}</h2>
            <PlanBadge paid={store.paid} />
            <StatusBadge access={access} />
          </div>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {store.owner_email ?? "sem e-mail"} · criada em {fmtDate(store.created_at)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {store.orders_30d} pedido{store.orders_30d === 1 ? "" : "s"} nos últimos 30 dias · {store.orders_total} no total
            {store.last_order_at ? ` · último em ${fmtDate(store.last_order_at)}` : ""}
          </p>
          {access.kind === "blocked" && access.reason ? (
            <p className="mt-1 text-xs text-red-700">Motivo: {access.reason}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <a href={siteHref} target="_blank" rel="noreferrer" className="rounded-lg p-2 text-muted-foreground hover:bg-muted" title="Abrir site da loja">
            <ExternalLink className="size-4" />
          </a>
          {contact ? (
            <a href={contact} target="_blank" rel="noreferrer" className="rounded-lg p-2 text-muted-foreground hover:bg-muted" title="WhatsApp da loja">
              <MessageCircle className="size-4" />
            </a>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {[7, 30, 365].map((d) => (
          <Button
            key={d}
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => act(() => extendStore(store.id, d), `+${d} dias adicionados.`)}
          >
            <CalendarPlus /> +{d === 365 ? "1 ano" : `${d} dias`}
          </Button>
        ))}
        {access.kind === "blocked" ? (
          <Button
            size="sm"
            disabled={pending}
            className="bg-emerald-600 text-white hover:bg-emerald-600/90"
            onClick={() => act(() => setStoreBlocked(store.id, false, ""), "Loja desbloqueada.")}
          >
            <LockOpen /> Desbloquear
          </Button>
        ) : (
          <Button size="sm" variant="destructive" disabled={pending} onClick={() => setOpen(true)}>
            <Lock /> Bloquear
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
          {open ? "Fechar" : "Mais opções"}
        </Button>
        {feedback?.message ? (
          <span role="status" className={cn("text-xs font-medium", feedback.ok ? "text-emerald-700" : "text-red-700")}>
            {feedback.message}
          </span>
        ) : null}
      </div>

      {open ? (
        <div className="mt-4 grid gap-5 border-t border-border pt-4 md:grid-cols-3">
          <div className="grid content-start gap-2">
            <Label htmlFor={`until-${store.id}`}>Acesso até o dia</Label>
            <Input id={`until-${store.id}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={pending || !date}
                onClick={() => act(() => setStoreUntil(store.id, date), "Validade salva.")}
              >
                Salvar data
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pending || access.kind === "unlimited"}
                onClick={() => {
                  setDate("");
                  act(() => setStoreUntil(store.id, ""), "Liberada sem prazo.");
                }}
              >
                <InfinityIcon /> Sem prazo
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Dar prazo marca a loja como pagante.</p>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              className="justify-self-start"
              onClick={() =>
                act(
                  () => setStorePaid(store.id, !store.paid),
                  store.paid ? "Marcada como teste grátis." : "Marcada como pagante.",
                )
              }
            >
              {store.paid ? <FlaskConical /> : <BadgeCheck />}
              {store.paid ? "Voltar para teste grátis" : "Marcar como pagante"}
            </Button>
          </div>

          <div className="grid content-start gap-2">
            <Label htmlFor={`reason-${store.id}`}>Mensagem para o lojista ao bloquear</Label>
            <Input
              id={`reason-${store.id}`}
              value={reason}
              maxLength={200}
              placeholder="Ex.: mensalidade de novembro em aberto"
              onChange={(e) => setReason(e.target.value)}
            />
            <Button
              size="sm"
              variant="destructive"
              disabled={pending}
              className="justify-self-start"
              onClick={() => act(() => setStoreBlocked(store.id, true, reason), "Loja bloqueada.")}
            >
              <Lock /> {access.kind === "blocked" ? "Atualizar mensagem" : "Bloquear agora"}
            </Button>
          </div>

          <div className="grid content-start gap-2">
            <Label htmlFor={`note-${store.id}`} className="flex items-center gap-1.5">
              <StickyNote className="size-3.5" /> Anotações (só você vê)
            </Label>
            <Textarea
              id={`note-${store.id}`}
              value={note}
              maxLength={1000}
              className="min-h-20"
              placeholder="Ex.: plano mensal R$ 79,90, paga todo dia 10"
              onChange={(e) => setNote(e.target.value)}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              className="justify-self-start"
              onClick={() => act(() => saveStoreNote(store.id, note), "Anotação salva.")}
            >
              Salvar anotação
            </Button>
          </div>

          <div className="rounded-xl border border-red-200 bg-red-50/60 p-4 md:col-span-3">
            {confirmDelete ? (
              <div className="grid gap-3">
                <p className="text-sm text-red-900">
                  <strong>Apagar {store.name} para sempre?</strong> Some o site, o cardápio, os pedidos, os clientes e os
                  motoboys dessa loja. <strong>Não dá para desfazer.</strong> Para confirmar, digite o endereço da loja:{" "}
                  <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs">{store.slug}</code>
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    aria-label="Endereço da loja para confirmar"
                    value={typedSlug}
                    onChange={(e) => setTypedSlug(e.target.value)}
                    placeholder={store.slug}
                    autoComplete="off"
                    className="h-9 max-w-64 bg-white"
                  />
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={pending || typedSlug.trim().toLowerCase() !== store.slug}
                    onClick={() => act(() => deleteStore(store.id, typedSlug), "Loja apagada.")}
                  >
                    <Trash2 /> Apagar para sempre
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setConfirmDelete(false);
                      setTypedSlug("");
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-red-900">
                  Estabelecimento que não vai mais usar? Você pode apagar a loja e tudo dela.
                </p>
                <Button size="sm" variant="outline" className="border-red-300 text-red-700 hover:bg-red-100" onClick={() => setConfirmDelete(true)}>
                  <Trash2 /> Apagar loja
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
