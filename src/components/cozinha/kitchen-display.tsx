"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertOctagon,
  CalendarClock,
  ChefHat,
  LayoutDashboard,
  Maximize,
  Minimize,
  Settings,
  Volume2,
  VolumeX,
} from "lucide-react";
import { kitchenSetStatus } from "@/app/cozinha/actions";
import {
  alertIds,
  brTime,
  kitchenErrorText,
  kitchenLanes,
  kitchenStartAt,
  kitchenUrgency,
  type KitchenBoard,
  type KitchenOrder,
} from "@/lib/kitchen";
import type { OrderStatus } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { KitchenSettings, type DeviceSettings } from "./kitchen-settings";
import { KitchenTicket, ReadyTicket } from "./kitchen-ticket";
import { useKitchenSound } from "./use-kitchen-sound";

const SETTINGS_KEY = "fomely-cozinha";
const DISMISSED_KEY = "fomely-cozinha-cancelados";
const DEFAULTS: DeviceSettings = { showPending: true, showReady: true, large: false, sound: true };

function readSettings(): DeviceSettings {
  try {
    return { ...DEFAULTS, ...(JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? "{}") as Partial<DeviceSettings>) };
  } catch {
    return DEFAULTS;
  }
}

function readDismissed() {
  try {
    return new Set(JSON.parse(window.localStorage.getItem(DISMISSED_KEY) ?? "[]") as string[]);
  } catch {
    return new Set<string>();
  }
}

function save(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // modo anônimo ou sem espaço: os ajustes valem só até fechar a tela
  }
}

type Live = "on" | "connecting" | "off";
type Tab = "pending" | "preparing" | "ready";

/**
 * Tela da cozinha (KDS). Com login (`token` null) recebe pedidos ao vivo pelo Supabase Realtime;
 * pelo link da cozinha (`token`) confere a cada 5 segundos. Nos dois casos confere de novo
 * quando a tela volta a aparecer ou a internet volta.
 */
export function KitchenDisplay({
  initialBoard,
  token,
  initialLink = null,
}: {
  initialBoard: KitchenBoard;
  token: string | null;
  initialLink?: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [board, setBoard] = useState(initialBoard);
  // Relógio do servidor: o tablet pode estar com a hora errada.
  const offset = useRef(0);
  const [now, setNow] = useState(() => Date.parse(initialBoard.now));
  const [settings, setSettingsState] = useState(readSettings);
  const [dismissed, setDismissed] = useState(readDismissed);
  const [started, setStarted] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [link, setLink] = useState(initialLink);
  const [live, setLive] = useState<Live>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [tab, setTab] = useState<Tab>(settings.showPending ? "pending" : "preparing");
  // Mudanças feitas nesta tela que ainda não voltaram do servidor (a tela responde na hora).
  const [statusOverrides, setStatusOverrides] = useState<Map<string, OrderStatus>>(new Map());
  const [doneOverrides, setDoneOverrides] = useState<Map<string, boolean>>(new Map());

  const setSettings = (s: DeviceSettings) => {
    setSettingsState(s);
    save(SETTINGS_KEY, s);
  };

  // ---------------------------------------------------------------- dados
  const loading = useRef(false);
  const again = useRef(false);
  const lastOk = useRef(0);

  const refresh = useCallback(async () => {
    if (loading.current) {
      again.current = true;
      return;
    }
    loading.current = true;
    try {
      do {
        again.current = false;
        const { data, error } = await supabase.rpc("kitchen_board", {
          p_store_id: token ? null : initialBoard.store.id,
          p_token: token,
        });
        if (error) {
          if (["link_invalido", "sem_permissao", "loja_indisponivel"].includes(error.message)) {
            setFatal(kitchenErrorText(error.message));
          }
          if (token) setLive("off");
          break;
        }
        const next = data as KitchenBoard;
        offset.current = Date.parse(next.now) - Date.now();
        lastOk.current = Date.now();
        setFatal(null);
        if (token) setLive("on");
        setBoard(next);
      } while (again.current);
    } catch {
      if (token) setLive("off");
    } finally {
      loading.current = false;
    }
  }, [supabase, token, initialBoard.store.id]);

  // Ao vivo (com login): qualquer mudança nos pedidos ou itens da loja recarrega a tela.
  useEffect(() => {
    if (token) return;
    let timer: number | undefined;
    const soon = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void refresh(), 250);
    };
    const filter = `store_id=eq.${initialBoard.store.id}`;
    const channel = supabase
      .channel(`cozinha-${initialBoard.store.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter }, soon)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "order_items", filter }, soon)
      .subscribe((status) => {
        setLive(status === "SUBSCRIBED" ? "on" : status === "CHANNEL_ERROR" || status === "CLOSED" || status === "TIMED_OUT" ? "off" : "connecting");
        if (status === "SUBSCRIBED") void refresh();
      });
    return () => {
      window.clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [supabase, token, initialBoard.store.id, refresh]);

  // Conferência periódica: 5 s pelo link; 20 s com login (caso a conexão ao vivo caia).
  useEffect(() => {
    const every = token ? 5000 : 20000;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
      if (token && Date.now() - lastOk.current > 20000) setLive("off");
    }, every);
    const onBack = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onBack);
    window.addEventListener("online", onBack);
    window.addEventListener("focus", onBack);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onBack);
      window.removeEventListener("online", onBack);
      window.removeEventListener("focus", onBack);
    };
  }, [refresh, token]);

  // Cronômetros.
  useEffect(() => {
    offset.current = Date.parse(initialBoard.now) - Date.now();
    lastOk.current = Date.now();
    const id = window.setInterval(() => setNow(Date.now() + offset.current), 1000);
    return () => window.clearInterval(id);
  }, [initialBoard.now]);

  // ---------------------------------------------------------------- colunas
  const timing = board.store;
  const orders = useMemo(
    () =>
      board.orders.map((o) => {
        const status = statusOverrides.get(o.id);
        return status && o.status !== "cancelled" ? { ...o, status } : o;
      }),
    [board.orders, statusOverrides],
  );
  const lanes = useMemo(
    () => kitchenLanes(orders, timing, now, { showPending: settings.showPending, dismissed }),
    [orders, timing, now, settings.showPending, dismissed],
  );
  const lateCount = [...lanes.pending, ...lanes.preparing].filter(
    (o) => kitchenUrgency(o, timing, now).level === "late",
  ).length;

  // ---------------------------------------------------------------- som
  const repeat = started && settings.showPending && lanes.pending.length > 0;
  const { play, unlock } = useKitchenSound(started && settings.sound, repeat);
  const seenAlert = useRef<Set<string> | null>(null);
  const seenCancel = useRef<Set<string> | null>(null);
  const alerting = alertIds(lanes, settings.showPending);
  const alertKey = [...alerting].sort().join(",");
  const cancelKey = lanes.cancelled.map((o) => o.id).join(",");

  useEffect(() => {
    const ids = alertKey ? alertKey.split(",") : [];
    // primeira carga: não toca pelo que já estava na tela
    if (!seenAlert.current) {
      seenAlert.current = new Set(ids);
      return;
    }
    const fresh = ids.filter((id) => !seenAlert.current!.has(id));
    ids.forEach((id) => seenAlert.current!.add(id));
    // com "aceitar" ligado a campainha já repete enquanto houver pedido novo
    if (fresh.length && !settings.showPending) play("new");
  }, [alertKey, settings.showPending, play]);

  useEffect(() => {
    const ids = cancelKey ? cancelKey.split(",") : [];
    if (!seenCancel.current) {
      seenCancel.current = new Set(ids);
      return;
    }
    const fresh = ids.filter((id) => !seenCancel.current!.has(id));
    ids.forEach((id) => seenCancel.current!.add(id));
    if (fresh.length) play("cancel");
  }, [cancelKey, play]);

  // ---------------------------------------------------------------- ações
  const advance = useCallback(
    async (order: KitchenOrder, status: "preparing" | "ready", undo = false) => {
      setError(null);
      setStatusOverrides((m) => new Map(m).set(order.id, status));
      const r = await kitchenSetStatus({ orderId: order.id, status, token, undo }).catch(() => null);
      if (!r?.ok) setError(r?.message ?? kitchenErrorText(null));
      await refresh();
      setStatusOverrides((m) => {
        const next = new Map(m);
        next.delete(order.id);
        return next;
      });
    },
    [token, refresh],
  );

  const toggleItem = useCallback(
    async (_order: KitchenOrder, itemId: string, done: boolean) => {
      setError(null);
      setDoneOverrides((m) => new Map(m).set(itemId, done));
      const { error } = await supabase.rpc("kitchen_item_done", { p_item_id: itemId, p_done: done, p_token: token });
      if (error) setError(kitchenErrorText(error.message));
      await refresh();
      setDoneOverrides((m) => {
        const next = new Map(m);
        next.delete(itemId);
        return next;
      });
    },
    [supabase, token, refresh],
  );

  const dismiss = (id: string) => {
    const next = new Set(dismissed).add(id);
    setDismissed(next);
    save(DISMISSED_KEY, [...next].slice(-100));
  };

  // ---------------------------------------------------------------- tela
  // Letra grande: aumenta a fonte base (tudo em rem cresce junto).
  useEffect(() => {
    const html = document.documentElement;
    const previous = html.style.fontSize;
    html.style.fontSize = settings.large ? "20px" : "";
    return () => {
      html.style.fontSize = previous;
    };
  }, [settings.large]);

  // Tela sempre acesa enquanto a cozinha estiver aberta.
  useEffect(() => {
    if (!started) return;
    let lock: WakeLockSentinel | null = null;
    const request = async () => {
      try {
        lock = (await navigator.wakeLock?.request("screen")) ?? null;
      } catch {
        // sem suporte: ajuste o tablet para não apagar a tela
      }
    };
    void request();
    const onVisible = () => document.visibilityState === "visible" && void request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, [started]);

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };

  const start = () => {
    unlock();
    setStarted(true);
  };

  useEffect(() => {
    const base = "Cozinha";
    const n = settings.showPending ? lanes.pending.length : 0;
    document.title = n ? `(${n}) Pedido novo! · ${base}` : `${base} · ${board.store.name}`;
  }, [lanes.pending.length, settings.showPending, board.store.name]);

  // A coluna escolhida no celular sumiu (ajuste mudou): volta para "Em preparo".
  const activeTab: Tab =
    (tab === "pending" && !settings.showPending) || (tab === "ready" && !settings.showReady) ? "preparing" : tab;

  const columns: { key: Tab; title: string; list: KitchenOrder[]; empty: string }[] = [
    ...(settings.showPending
      ? [{ key: "pending" as const, title: "Novos", list: lanes.pending, empty: "Nenhum pedido novo." }]
      : []),
    { key: "preparing", title: "Em preparo", list: lanes.preparing, empty: "Nada em preparo agora." },
    ...(settings.showReady
      ? [{ key: "ready" as const, title: "Prontos", list: lanes.ready, empty: "Nenhum pedido pronto." }]
      : []),
  ];
  const gridCols =
    columns.length === 3
      ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,0.75fr)]"
      : columns.length === 2 && settings.showPending
        ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"
        : columns.length === 2
          ? "lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]"
          : "lg:grid-cols-1";

  const busyIds = statusOverrides;

  return (
    <div
      className="kds flex h-dvh flex-col overflow-hidden bg-zinc-950 text-zinc-50"
      style={{ "--brand": board.store.primary_color } as React.CSSProperties}
    >
      {/* Cabeçalho */}
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-zinc-800 bg-zinc-900 px-3 py-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand text-brand-foreground">
            <ChefHat className="size-5" />
          </span>
          <div className="min-w-0 leading-tight">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Cozinha</p>
            <p className="truncate font-bold">{board.store.name}</p>
          </div>
        </div>

        <div className="order-3 flex w-full gap-2 overflow-x-auto sm:order-none sm:w-auto sm:flex-1 sm:justify-center">
          {settings.showPending ? <Counter label="Novos" value={lanes.pending.length} tone="sky" /> : null}
          <Counter label="Em preparo" value={lanes.preparing.length} tone="zinc" />
          <Counter label="Atrasados" value={lateCount} tone={lateCount ? "red" : "zinc"} />
          {lanes.upcoming.length ? <Counter label="Agendados" value={lanes.upcoming.length} tone="violet" /> : null}
        </div>

        <div className="ml-auto flex items-center gap-1 sm:ml-0">
          <span
            className="mr-1 flex items-center gap-1.5 text-xs text-zinc-400"
            title={live === "on" ? "Conectado" : live === "off" ? "Sem conexão" : "Conectando"}
          >
            <span
              className={cn(
                "size-2.5 rounded-full",
                live === "on" ? "bg-emerald-500" : live === "off" ? "animate-pulse bg-red-500" : "bg-amber-400",
              )}
            />
            <span className="hidden md:inline">
              {live === "on" ? "Ao vivo" : live === "off" ? "Sem conexão" : "Conectando"}
            </span>
          </span>
          <span className="mr-2 font-mono text-2xl font-bold tabular-nums" suppressHydrationWarning>
            {brTime(now)}
          </span>
          <IconButton
            label={settings.sound ? "Desligar som" : "Ligar som"}
            onClick={() => {
              unlock();
              setSettings({ ...settings, sound: !settings.sound });
            }}
          >
            {settings.sound ? <Volume2 /> : <VolumeX className="text-red-400" />}
          </IconButton>
          <IconButton label={fullscreen ? "Sair da tela cheia" : "Tela cheia"} onClick={toggleFullscreen}>
            {fullscreen ? <Minimize /> : <Maximize />}
          </IconButton>
          <IconButton label="Ajustes da cozinha" onClick={() => setSettingsOpen(true)}>
            <Settings />
          </IconButton>
          {!token ? (
            <Link
              href="/painel/pedidos"
              aria-label="Voltar ao painel"
              title="Voltar ao painel"
              className="flex size-11 items-center justify-center rounded-xl text-zinc-300 hover:bg-zinc-800 [&_svg]:size-5"
            >
              <LayoutDashboard />
            </Link>
          ) : null}
        </div>
      </header>

      {fatal ? (
        <p className="shrink-0 bg-red-600 px-4 py-2 text-center font-semibold text-white">{fatal}</p>
      ) : live === "off" ? (
        <p className="shrink-0 bg-red-600/90 px-4 py-1.5 text-center text-sm font-semibold text-white">
          Sem conexão com a internet. Os pedidos novos aparecem assim que a conexão voltar.
        </p>
      ) : null}
      {error ? (
        <button
          onClick={() => setError(null)}
          className="shrink-0 cursor-pointer bg-amber-400 px-4 py-1.5 text-center text-sm font-semibold text-zinc-950"
        >
          {error} (toque para fechar)
        </button>
      ) : null}

      {/* Cancelados: a cozinha precisa parar */}
      {lanes.cancelled.map((o) => (
        <div
          key={o.id}
          role="alert"
          className="kds-late flex shrink-0 flex-wrap items-center gap-3 border-b border-red-800 bg-red-700 px-4 py-2.5 text-white"
        >
          <AlertOctagon className="size-6 shrink-0" />
          <p className="min-w-0 flex-1 text-lg font-bold">
            Pedido #{o.number} foi CANCELADO. Pare o preparo.
            {o.cancel_reason ? <span className="font-medium"> Motivo: {o.cancel_reason}</span> : null}
          </p>
          <button
            onClick={() => dismiss(o.id)}
            className="h-10 cursor-pointer rounded-lg bg-white px-4 font-bold text-red-700 hover:bg-red-50"
          >
            Entendi
          </button>
        </div>
      ))}

      {/* Agendados que ainda não é hora de começar */}
      {lanes.upcoming.length ? (
        <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm">
          <span className="flex shrink-0 items-center gap-1.5 font-semibold text-violet-300">
            <CalendarClock className="size-4" /> Agendados
          </span>
          {lanes.upcoming.map((o) => (
            <span key={o.id} className="shrink-0 rounded-lg bg-violet-500/15 px-2.5 py-1 text-violet-100">
              <strong>#{o.number}</strong> · {o.fulfillment === "delivery" ? "entrega" : "retirada"}{" "}
              {brTime(o.scheduled_for!)} · começar {brTime(kitchenStartAt(o, timing))}
            </span>
          ))}
        </div>
      ) : null}

      {/* Abas no celular */}
      <div className="flex shrink-0 gap-2 overflow-x-auto px-3 pt-3 lg:hidden">
        {columns.map((c) => (
          <button
            key={c.key}
            onClick={() => setTab(c.key)}
            className={cn(
              "shrink-0 cursor-pointer rounded-full border px-4 py-2 text-sm font-bold",
              activeTab === c.key ? "border-white bg-white text-zinc-950" : "border-zinc-700 text-zinc-300",
            )}
          >
            {c.title} ({c.list.length})
          </button>
        ))}
      </div>

      {/* Colunas */}
      <main className={cn("grid min-h-0 flex-1 gap-3 p-3", gridCols)}>
        {columns.map((c) => (
          <section
            key={c.key}
            aria-label={c.title}
            className={cn("flex min-h-0 flex-col", activeTab !== c.key && "hidden lg:flex")}
          >
            <h2 className="mb-2 hidden shrink-0 items-center justify-between px-1 text-sm font-bold uppercase tracking-wide text-zinc-400 lg:flex">
              {c.title}
              <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-zinc-200">{c.list.length}</span>
            </h2>
            <div
              className={cn(
                "min-h-0 flex-1 overflow-y-auto overscroll-contain pb-6",
                c.key === "preparing"
                  ? "grid auto-rows-max content-start items-start gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,19rem),1fr))]"
                  : "grid auto-rows-max content-start gap-3",
              )}
            >
              {c.list.length === 0 ? (
                <p className="col-span-full rounded-2xl border border-dashed border-zinc-800 px-4 py-10 text-center text-zinc-500">
                  {c.empty}
                </p>
              ) : null}
              {c.list.map((o) =>
                c.key === "ready" ? (
                  <ReadyTicket
                    key={o.id}
                    order={o}
                    now={now}
                    busy={busyIds.has(o.id)}
                    onUndo={(order) => void advance(order, "preparing", true)}
                  />
                ) : (
                  <KitchenTicket
                    key={o.id}
                    order={o}
                    timing={timing}
                    now={now}
                    busy={busyIds.has(o.id)}
                    doneOverrides={doneOverrides}
                    onAdvance={(order) => void advance(order, order.status === "pending" ? "preparing" : "ready")}
                    onToggleItem={(order, itemId, done) => void toggleItem(order, itemId, done)}
                  />
                ),
              )}
            </div>
          </section>
        ))}
      </main>

      <KitchenSettings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSettings={setSettings}
        canManage={!token}
        targetMinutes={board.store.kitchen_target_minutes}
        onTargetSaved={(m) => {
          setBoard((b) => ({ ...b, store: { ...b.store, kitchen_target_minutes: m } }));
          void refresh();
        }}
        link={link}
        onLink={setLink}
      />

      {/* O navegador só libera som e tela cheia depois de um toque. */}
      {!started ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-zinc-950/85 p-6 backdrop-blur-sm">
          <button
            onClick={start}
            className="grid max-w-md cursor-pointer justify-items-center gap-4 rounded-3xl bg-zinc-900 p-8 text-center shadow-2xl ring-1 ring-zinc-700"
          >
            <span className="flex size-20 items-center justify-center rounded-3xl bg-brand text-brand-foreground">
              <ChefHat className="size-10" />
            </span>
            <span className="text-2xl font-black">Abrir a cozinha</span>
            <span className="text-zinc-300">
              Toque para começar. Assim o som de pedido novo funciona e a tela não apaga sozinha.
            </span>
            <span className="mt-2 rounded-xl bg-brand px-6 py-3 text-lg font-bold text-brand-foreground">Começar</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Counter({ label, value, tone }: { label: string; value: number; tone: "sky" | "zinc" | "red" | "violet" }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-semibold",
        tone === "sky" && "bg-sky-400/15 text-sky-200",
        tone === "zinc" && "bg-zinc-800 text-zinc-200",
        tone === "red" && "kds-late bg-red-600 text-white",
        tone === "violet" && "bg-violet-500/15 text-violet-200",
      )}
    >
      {label}
      <span className="text-lg font-black tabular-nums">{value}</span>
    </span>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex size-11 cursor-pointer items-center justify-center rounded-xl text-zinc-300 hover:bg-zinc-800 [&_svg]:size-5"
    >
      {children}
    </button>
  );
}
