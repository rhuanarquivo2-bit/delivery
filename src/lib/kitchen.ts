import type { Fulfillment, OrderStatus } from "./types";

// ---------------------------------------------------------------------------
// Tela da cozinha (KDS). Tipos do que vem de `kitchen_board` e regras de tempo.
// Tudo aqui é puro (sem React nem Supabase) para poder testar.
// ---------------------------------------------------------------------------

export type KitchenItem = {
  id: string;
  quantity: number;
  product_name: string;
  size_name: string | null;
  flavors: string[] | null;
  options: string[];
  notes: string | null;
  /** Riscado pela cozinha (pronto). */
  done_at: string | null;
};

export type KitchenOrder = {
  id: string;
  number: number;
  status: OrderStatus;
  fulfillment: Fulfillment;
  customer_name: string;
  notes: string | null;
  scheduled_for: string | null;
  created_at: string;
  accepted_at: string | null;
  ready_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  items: KitchenItem[];
};

export type KitchenStore = {
  id: string;
  name: string;
  primary_color: string;
  logo_url: string | null;
  /** Tempo que o cliente vê no site (preparo + entrega). */
  prep_time_minutes: number;
  /** Tempo alvo da cozinha: passou disso, o pedido está atrasado. */
  kitchen_target_minutes: number;
};

export type KitchenBoard = { now: string; store: KitchenStore; orders: KitchenOrder[] };

export type KitchenTiming = Pick<KitchenStore, "prep_time_minutes" | "kitchen_target_minutes">;

const MIN = 60_000;

/** Agendado aparece em "Novos" um pouco antes da hora de começar. */
export const SCHEDULE_LEAD_MINUTES = 5;

/**
 * Até quando o pedido tem que sair da cozinha.
 * - Para agora: criado + tempo alvo da cozinha.
 * - Agendado para retirada: no horário marcado.
 * - Agendado para entrega: antes do horário, descontando o tempo do caminho
 *   (tempo do site − tempo da cozinha).
 */
export function kitchenDueAt(order: Pick<KitchenOrder, "scheduled_for" | "created_at" | "fulfillment">, t: KitchenTiming) {
  if (order.scheduled_for) {
    const travel = order.fulfillment === "delivery" ? Math.max(0, t.prep_time_minutes - t.kitchen_target_minutes) : 0;
    return Date.parse(order.scheduled_for) - travel * MIN;
  }
  return Date.parse(order.created_at) + t.kitchen_target_minutes * MIN;
}

/** Quando a cozinha deveria começar (o cronômetro conta a partir daqui). */
export function kitchenStartAt(order: Pick<KitchenOrder, "scheduled_for" | "created_at" | "fulfillment">, t: KitchenTiming) {
  if (!order.scheduled_for) return Date.parse(order.created_at);
  return kitchenDueAt(order, t) - t.kitchen_target_minutes * MIN;
}

/** Agendado que ainda não chegou a hora de começar: fica na faixa "Agendados". */
export function isUpcoming(order: KitchenOrder, t: KitchenTiming, now: number) {
  return (
    order.status === "pending" &&
    !!order.scheduled_for &&
    now < kitchenStartAt(order, t) - SCHEDULE_LEAD_MINUTES * MIN
  );
}

export type Urgency = "ok" | "warn" | "late";

/**
 * Situação do pedido: no prazo, quase no limite (último quarto do tempo, no mínimo 3 min)
 * ou atrasado. `remainingMs` negativo = atrasado.
 */
export function kitchenUrgency(order: KitchenOrder, t: KitchenTiming, now: number) {
  const due = kitchenDueAt(order, t);
  const remainingMs = due - now;
  const warnMs = Math.max(3 * MIN, (t.kitchen_target_minutes * MIN) / 4);
  const level: Urgency = remainingMs < 0 ? "late" : remainingMs <= warnMs ? "warn" : "ok";
  // fração do tempo já usada (0 a 1), para a barra do cartão
  const total = t.kitchen_target_minutes * MIN;
  const progress = Math.min(1, Math.max(0, (now - (due - total)) / total));
  return { level, remainingMs, progress, dueAt: due };
}

/** Cronômetro: "4:07", "59:59", "1h05". Negativo vira 0:00. */
export function formatTimer(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s >= 3600) return `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "3 min", "1h05" (arredonda para cima: 10 s faltando = 1 min). */
export function formatMinutes(ms: number) {
  const m = Math.max(1, Math.ceil(Math.abs(ms) / MIN));
  if (m >= 60) return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
  return `${m} min`;
}

const FRACTIONS: Record<number, string> = { 2: "½", 3: "⅓", 4: "¼" };

/** Sabores da pizza: "½ Calabresa + ½ Mussarela". Um sabor só: null (o nome já diz). */
export function flavorsLine(flavors: string[] | null) {
  if (!flavors || flavors.length < 2) return null;
  const f = FRACTIONS[flavors.length];
  return flavors.map((name) => (f ? `${f} ${name}` : name)).join(" + ");
}

/** Hora no horário de Brasília: "20:15". */
export function brTime(iso: string | number) {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(
    new Date(iso),
  );
}

/** Primeiro nome + inicial do sobrenome: "Bia L.". */
export function shortName(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return parts[0] ?? "";
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

export type KitchenLanes = {
  upcoming: KitchenOrder[];
  pending: KitchenOrder[];
  preparing: KitchenOrder[];
  ready: KitchenOrder[];
  cancelled: KitchenOrder[];
};

/**
 * Separa os pedidos nas colunas da tela.
 * - Novos e em preparo: pelo prazo (o mais apertado primeiro).
 * - Prontos: o mais recente primeiro.
 * - Cancelados: só os que a cozinha já tinha visto (aceitos, ou novos se a cozinha aceita
 *   pedidos), e que ainda não foram dispensados nesta tela.
 */
export function kitchenLanes(
  orders: KitchenOrder[],
  t: KitchenTiming,
  now: number,
  opts: { showPending: boolean; dismissed?: Set<string> },
): KitchenLanes {
  const byDue = (a: KitchenOrder, b: KitchenOrder) => kitchenDueAt(a, t) - kitchenDueAt(b, t) || a.number - b.number;
  const lanes: KitchenLanes = { upcoming: [], pending: [], preparing: [], ready: [], cancelled: [] };
  for (const o of orders) {
    if (o.status === "pending") {
      if (isUpcoming(o, t, now)) lanes.upcoming.push(o);
      else if (opts.showPending) lanes.pending.push(o);
    } else if (o.status === "preparing") lanes.preparing.push(o);
    else if (o.status === "ready") lanes.ready.push(o);
    else if (o.status === "cancelled" && !opts.dismissed?.has(o.id) && (o.accepted_at || opts.showPending)) {
      lanes.cancelled.push(o);
    }
  }
  lanes.upcoming.sort(byDue);
  lanes.pending.sort(byDue);
  lanes.preparing.sort(byDue);
  lanes.ready.sort((a, b) => (b.ready_at ?? "").localeCompare(a.ready_at ?? ""));
  lanes.cancelled.sort((a, b) => (b.cancelled_at ?? "").localeCompare(a.cancelled_at ?? ""));
  return lanes;
}

/** Pedidos que fazem o som de "chegou pedido": novos (se a cozinha aceita) ou recém aceitos. */
export function alertIds(lanes: KitchenLanes, showPending: boolean) {
  return new Set((showPending ? lanes.pending : lanes.preparing).map((o) => o.id));
}

const KITCHEN_ERRORS: Record<string, string> = {
  link_invalido: "Este link da cozinha não vale mais. Peça o link novo para a loja.",
  sem_permissao: "Sem acesso a esta loja. Entre de novo no painel.",
  loja_indisponivel: "O acesso da loja está suspenso. Fale com o suporte.",
  pedido_nao_encontrado: "Esse pedido não está mais na cozinha.",
  item_nao_encontrado: "Esse item não está mais na cozinha.",
  status_invalido: "Esse pedido mudou de situação. A tela foi atualizada.",
};

/** Mensagem em português para os códigos de erro das funções da cozinha. */
export function kitchenErrorText(code: string | undefined | null) {
  return (code && KITCHEN_ERRORS[code]) || "Não deu certo. Confira a internet e tente de novo.";
}
