"use client";

import { useEffect, useState, useTransition } from "react";
import QRCode from "qrcode";
import { Copy, Link2, RefreshCw, Unlink } from "lucide-react";
import { disableKitchenLink, rotateKitchenLink, setKitchenTarget } from "@/app/cozinha/actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";

export type DeviceSettings = {
  /** A cozinha aceita os pedidos novos (senão só vê depois que o caixa aceitar no painel). */
  showPending: boolean;
  showReady: boolean;
  large: boolean;
  sound: boolean;
};

function Row({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div>
        <p className="font-semibold">{title}</p>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <Switch label={title} checked={checked} onCheckedChange={onChange} className="mt-0.5" />
    </div>
  );
}

/** Ajustes da tela da cozinha: deste aparelho e (com login) da loja: tempo alvo e link sem login. */
export function KitchenSettings({
  open,
  onClose,
  settings,
  onSettings,
  canManage,
  targetMinutes,
  onTargetSaved,
  link,
  onLink,
}: {
  open: boolean;
  onClose: () => void;
  settings: DeviceSettings;
  onSettings: (s: DeviceSettings) => void;
  /** Logado no painel: pode mudar o tempo alvo e o link da cozinha. */
  canManage: boolean;
  targetMinutes: number;
  onTargetSaved: (minutes: number) => void;
  link: string | null;
  onLink: (token: string | null) => void;
}) {
  const set = (patch: Partial<DeviceSettings>) => onSettings({ ...settings, ...patch });

  return (
    <Dialog open={open} onClose={onClose} label="Ajustes da cozinha" className="sm:max-w-xl">
      <div className="grid gap-6 overflow-y-auto p-5 text-foreground">
        <div className="pr-10">
          <h2 className="text-xl font-bold">Ajustes da cozinha</h2>
          <p className="text-sm text-muted-foreground">Os ajustes desta tela valem só para este aparelho.</p>
        </div>

        <section className="divide-y divide-border">
          <Row
            title="A cozinha aceita os pedidos novos"
            description="Desligado: o pedido só aparece aqui depois que o caixa aceitar no painel de pedidos."
            checked={settings.showPending}
            onChange={(v) => set({ showPending: v })}
          />
          <Row
            title="Mostrar a coluna Prontos"
            description="Pedidos prontos esperando motoboy ou retirada (com o botão para voltar ao preparo)."
            checked={settings.showReady}
            onChange={(v) => set({ showReady: v })}
          />
          <Row
            title="Letra grande"
            description="Para TV ou tela longe do fogão."
            checked={settings.large}
            onChange={(v) => set({ large: v })}
          />
          <Row
            title="Som de pedido novo"
            description="Campainha quando chega pedido e aviso quando um pedido é cancelado."
            checked={settings.sound}
            onChange={(v) => set({ sound: v })}
          />
        </section>

        {canManage ? <TargetForm minutes={targetMinutes} onSaved={onTargetSaved} /> : null}
        {canManage ? <LinkSection link={link} onLink={onLink} /> : null}
      </div>
    </Dialog>
  );
}

function TargetForm({ minutes, onSaved }: { minutes: number; onSaved: (m: number) => void }) {
  const [value, setValue] = useState(String(minutes));
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <section className="grid gap-2 rounded-2xl bg-muted p-4">
      <h3 className="font-semibold">Tempo alvo da cozinha</h3>
      <p className="text-sm text-muted-foreground">
        Passou desse tempo, o pedido fica vermelho na tela. Vale para todas as telas da loja. Pedido agendado conta pelo
        horário marcado.
      </p>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const r = await setKitchenTarget(Number(value));
            setMessage(r.ok ? "Salvo." : r.message);
            if (r.ok) onSaved(r.minutes);
          });
        }}
      >
        <label className="flex items-center gap-2 text-sm">
          <input
            aria-label="Tempo alvo em minutos"
            type="number"
            min={5}
            max={120}
            inputMode="numeric"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="h-11 w-24 rounded-xl border border-border bg-card px-3 text-base"
          />
          minutos
        </label>
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando..." : "Salvar"}
        </Button>
        {message ? <span className="text-sm text-muted-foreground">{message}</span> : null}
      </form>
    </section>
  );
}

function LinkSection({ link, onLink }: { link: string | null; onLink: (token: string | null) => void }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const url = link ? `${window.location.origin}/cozinha/${link}` : null;

  useEffect(() => {
    if (!url) return;
    let alive = true;
    QRCode.toDataURL(url, { margin: 1, width: 360 })
      .then((d) => alive && setQr(d))
      .catch(() => alive && setQr(null));
    return () => {
      alive = false;
    };
  }, [url]);

  const run = (job: () => Promise<{ ok: boolean; message?: string; token?: string }>, done: string) =>
    startTransition(async () => {
      const r = await job();
      if (!r.ok) return setMessage(r.message ?? "Não deu certo.");
      onLink(r.token ?? null);
      setMessage(done);
    });

  return (
    <section className="grid gap-3 rounded-2xl bg-muted p-4">
      <h3 className="flex items-center gap-2 font-semibold">
        <Link2 className="size-4" /> Abrir em outro aparelho sem login
      </h3>
      <p className="text-sm text-muted-foreground">
        Para o tablet ou a TV da cozinha, sem precisar da senha do painel. Quem tem o link só vê os pedidos da cozinha (sem
        valores, telefone ou endereço) e só pode aceitar, marcar pronto e riscar itens.
      </p>
      {url ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input
              readOnly
              aria-label="Link da cozinha"
              value={url}
              onFocus={(e) => e.target.select()}
              className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-card px-3 font-mono text-xs"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                navigator.clipboard
                  ?.writeText(url)
                  .then(() => setMessage("Link copiado."))
                  .catch(() => setMessage("Selecione o link e copie."))
              }
            >
              <Copy /> Copiar
            </Button>
          </div>
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="QR Code do link da cozinha" className="size-40 rounded-xl bg-white p-2" />
          ) : null}
          <p className="text-xs text-muted-foreground">Aponte a câmera do tablet para o QR Code para abrir.</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => run(rotateKitchenLink, "Link trocado. O link antigo parou de funcionar.")}
            >
              <RefreshCw /> Trocar link
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-red-600"
              disabled={pending}
              onClick={() => run(disableKitchenLink, "Link desligado.")}
            >
              <Unlink /> Desligar link
            </Button>
          </div>
        </>
      ) : (
        <Button
          type="button"
          className="w-fit"
          disabled={pending}
          onClick={() => run(rotateKitchenLink, "Link criado.")}
        >
          <Link2 /> {pending ? "Criando..." : "Criar link da cozinha"}
        </Button>
      )}
      {message ? <p className="text-sm font-medium">{message}</p> : null}
    </section>
  );
}
