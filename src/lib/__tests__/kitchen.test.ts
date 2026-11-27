import { describe, expect, it } from "vitest";
import {
  alertIds,
  flavorsLine,
  formatMinutes,
  formatTimer,
  isUpcoming,
  kitchenDueAt,
  kitchenLanes,
  kitchenStartAt,
  kitchenUrgency,
  shortName,
  type KitchenOrder,
} from "../kitchen";

const t = { prep_time_minutes: 50, kitchen_target_minutes: 20 };
const MIN = 60_000;
const base = Date.parse("2026-11-27T22:00:00Z");
const at = (min: number) => new Date(base + min * MIN).toISOString();

const order = (o: Partial<KitchenOrder>): KitchenOrder => ({
  id: o.id ?? "o1",
  number: 1,
  status: "preparing",
  fulfillment: "delivery",
  customer_name: "Bia Lima",
  notes: null,
  scheduled_for: null,
  created_at: at(0),
  accepted_at: at(1),
  ready_at: null,
  cancelled_at: null,
  cancel_reason: null,
  items: [],
  ...o,
});

describe("prazo da cozinha", () => {
  it("pedido para agora: criado + tempo alvo", () => {
    const o = order({});
    expect(kitchenDueAt(o, t)).toBe(base + 20 * MIN);
    expect(kitchenStartAt(o, t)).toBe(base);
  });

  it("agendado para entrega desconta o caminho (50 - 20 = 30 min)", () => {
    const o = order({ scheduled_for: at(120) });
    expect(kitchenDueAt(o, t)).toBe(base + 90 * MIN);
    expect(kitchenStartAt(o, t)).toBe(base + 70 * MIN);
  });

  it("agendado para retirada: pronto no horário marcado", () => {
    const o = order({ scheduled_for: at(120), fulfillment: "pickup" });
    expect(kitchenDueAt(o, t)).toBe(base + 120 * MIN);
  });

  it("tempo do site menor que o da cozinha não vira caminho negativo", () => {
    const o = order({ scheduled_for: at(120) });
    expect(kitchenDueAt(o, { prep_time_minutes: 15, kitchen_target_minutes: 20 })).toBe(base + 120 * MIN);
  });
});

describe("situação do pedido", () => {
  const o = order({});
  it("no prazo, quase no limite e atrasado", () => {
    expect(kitchenUrgency(o, t, base + 5 * MIN).level).toBe("ok");
    // último quarto de 20 min = 5 min
    expect(kitchenUrgency(o, t, base + 15 * MIN).level).toBe("warn");
    expect(kitchenUrgency(o, t, base + 20 * MIN).level).toBe("warn");
    expect(kitchenUrgency(o, t, base + 21 * MIN).level).toBe("late");
    expect(kitchenUrgency(o, t, base + 21 * MIN).remainingMs).toBe(-1 * MIN);
  });

  it("aviso nunca menor que 3 minutos", () => {
    const short = { prep_time_minutes: 30, kitchen_target_minutes: 8 };
    expect(kitchenUrgency(o, short, base + 5 * MIN).level).toBe("warn");
    expect(kitchenUrgency(o, short, base + 4 * MIN).level).toBe("ok");
  });

  it("barra de progresso vai de 0 a 1", () => {
    expect(kitchenUrgency(o, t, base - MIN).progress).toBe(0);
    expect(kitchenUrgency(o, t, base + 10 * MIN).progress).toBe(0.5);
    expect(kitchenUrgency(o, t, base + 60 * MIN).progress).toBe(1);
  });
});

describe("agendados", () => {
  const o = order({ status: "pending", accepted_at: null, scheduled_for: at(120) });
  it("fica na faixa até 5 min antes da hora de começar", () => {
    // começa aos 70 min
    expect(isUpcoming(o, t, base + 64 * MIN)).toBe(true);
    expect(isUpcoming(o, t, base + 65 * MIN)).toBe(false);
  });
  it("aceito antes da hora sai da faixa", () => {
    expect(isUpcoming({ ...o, status: "preparing" }, t, base)).toBe(false);
  });
});

describe("colunas", () => {
  const orders = [
    order({ id: "p1", number: 3, status: "pending", accepted_at: null, created_at: at(10) }),
    order({ id: "p2", number: 2, status: "pending", accepted_at: null, created_at: at(5) }),
    order({ id: "s1", number: 4, status: "pending", accepted_at: null, scheduled_for: at(300) }),
    order({ id: "c1", number: 5, status: "preparing" }),
    order({ id: "r1", number: 6, status: "ready", ready_at: at(8) }),
    order({ id: "r2", number: 7, status: "ready", ready_at: at(9) }),
    order({ id: "x1", number: 8, status: "cancelled", cancelled_at: at(9) }),
    order({ id: "x2", number: 9, status: "cancelled", accepted_at: null, cancelled_at: at(9) }),
  ];

  it("separa e ordena pelo prazo", () => {
    const l = kitchenLanes(orders, t, base + 12 * MIN, { showPending: true });
    expect(l.pending.map((o) => o.id)).toEqual(["p2", "p1"]);
    expect(l.upcoming.map((o) => o.id)).toEqual(["s1"]);
    expect(l.preparing.map((o) => o.id)).toEqual(["c1"]);
    expect(l.ready.map((o) => o.id)).toEqual(["r2", "r1"]);
    expect(l.cancelled.map((o) => o.id).sort()).toEqual(["x1", "x2"]);
  });

  it("cozinha que não aceita pedidos não vê novos nem cancelados que nunca viu", () => {
    const l = kitchenLanes(orders, t, base + 12 * MIN, { showPending: false });
    expect(l.pending).toEqual([]);
    expect(l.cancelled.map((o) => o.id)).toEqual(["x1"]);
    expect([...alertIds(l, false)]).toEqual(["c1"]);
  });

  it("cancelado dispensado some", () => {
    const l = kitchenLanes(orders, t, base, { showPending: true, dismissed: new Set(["x1", "x2"]) });
    expect(l.cancelled).toEqual([]);
  });
});

describe("textos", () => {
  it("cronômetro", () => {
    expect(formatTimer(0)).toBe("0:00");
    expect(formatTimer(-5000)).toBe("0:00");
    expect(formatTimer(247_000)).toBe("4:07");
    expect(formatTimer(65 * MIN)).toBe("1h05");
  });
  it("minutos", () => {
    expect(formatMinutes(10_000)).toBe("1 min");
    expect(formatMinutes(-3 * MIN)).toBe("3 min");
    expect(formatMinutes(75 * MIN)).toBe("1h15");
  });
  it("sabores", () => {
    expect(flavorsLine(["Calabresa"])).toBeNull();
    expect(flavorsLine(["Calabresa", "Mussarela"])).toBe("½ Calabresa + ½ Mussarela");
    expect(flavorsLine(["A", "B", "C"])).toBe("⅓ A + ⅓ B + ⅓ C");
    expect(flavorsLine(["A", "B", "C", "D", "E"])).toBe("A + B + C + D + E");
  });
  it("nome curto", () => {
    expect(shortName("Bia Lima Souza")).toBe("Bia S.");
    expect(shortName("  Carlos ")).toBe("Carlos");
  });
});
