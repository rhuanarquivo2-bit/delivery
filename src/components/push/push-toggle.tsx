"use client";

import { useEffect, useState, useTransition } from "react";
import { Bell, BellOff, BellRing, Share } from "lucide-react";
import { subscribePush, unsubscribePush, type PushFor } from "@/lib/push/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

type State = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on";

const flagKey = (t: PushFor) => `push:${t.audience}:${"token" in t ? t.token : "painel"}`;

function base64ToBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

function readFlag(key: string) {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key: string, on: boolean) {
  try {
    if (on) window.localStorage.setItem(key, "1");
    else window.localStorage.removeItem(key);
  } catch {}
}

async function detect(key: string): Promise<State> {
  const supported = VAPID && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!supported) return isIos() && !isStandalone() ? "ios-install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" && readFlag(key) ? "on" : "off";
}

/**
 * Botão para ligar as notificações neste aparelho.
 * `title` diz o que vai chegar (ex.: "Avisar quando chegar pedido").
 */
export function PushToggle({
  target,
  title,
  description,
  className,
}: {
  target: PushFor;
  title: string;
  description?: string;
  className?: string;
}) {
  const key = flagKey(target);
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let alive = true;
    detect(key)
      .then((s) => alive && setState(s))
      .catch(() => alive && setState("unsupported"));
    return () => {
      alive = false;
    };
  }, [key]);

  function turnOn() {
    setError(null);
    start(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState(permission === "denied" ? "denied" : "off");
          return;
        }
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        await navigator.serviceWorker.ready;
        const sub =
          (await reg.pushManager.getSubscription()) ??
          (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ToBytes(VAPID) }));
        const res = await subscribePush(sub.toJSON(), target);
        if (!res.ok) {
          setError(res.message);
          return;
        }
        writeFlag(key, true);
        setState("on");
      } catch {
        setError("Não deu para ligar neste aparelho. Tente de novo.");
      }
    });
  }

  function turnOff() {
    setError(null);
    start(async () => {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) await unsubscribePush(sub.endpoint, target);
      writeFlag(key, false);
      setState("off");
    });
  }

  if (state === "loading" || state === "unsupported") return null;

  return (
    <div
      data-push={state}
      className={cn("flex flex-col gap-2 rounded-xl border border-border bg-card p-3 text-sm sm:flex-row sm:items-center", className)}
    >
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <span
          className={cn(
            "mt-0.5 grid size-8 shrink-0 place-items-center rounded-full",
            state === "on" ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground",
          )}
        >
          {state === "on" ? <BellRing className="size-4" /> : state === "denied" ? <BellOff className="size-4" /> : <Bell className="size-4" />}
        </span>
        <div className="min-w-0">
          <p className="font-medium">{state === "on" ? "Notificações ligadas neste aparelho" : title}</p>
          {state === "ios-install" ? (
            <p className="text-muted-foreground">
              No iPhone, toque em <Share className="inline size-3.5 align-[-2px]" /> <b>Compartilhar</b> e depois em{" "}
              <b>Adicionar à Tela de Início</b>. Abra pelo ícone novo e ative aqui.
            </p>
          ) : state === "denied" ? (
            <p className="text-muted-foreground">
              As notificações estão bloqueadas. Libere nas configurações do navegador (ícone de cadeado ao lado do endereço) e
              recarregue a página.
            </p>
          ) : description ? (
            <p className="text-muted-foreground">{description}</p>
          ) : null}
          {error ? <p className="text-red-600">{error}</p> : null}
        </div>
      </div>
      {state === "off" ? (
        <Button size="sm" onClick={turnOn} disabled={pending} className="shrink-0">
          {pending ? "Ligando…" : "Ativar"}
        </Button>
      ) : state === "on" ? (
        <Button size="sm" variant="outline" onClick={turnOff} disabled={pending} className="shrink-0">
          {pending ? "Desligando…" : "Desligar"}
        </Button>
      ) : null}
    </div>
  );
}
