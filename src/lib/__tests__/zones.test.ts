import { describe, expect, it } from "vitest";
import { feeInputFor, parseZoneFee } from "../zones";

describe("parseZoneFee", () => {
  it("lê valores em reais", () => {
    expect(parseZoneFee("10,00")).toEqual({ ok: true, served: true, cents: 1000 });
    expect(parseZoneFee("R$ 7,5")).toEqual({ ok: true, served: true, cents: 750 });
    expect(parseZoneFee("8")).toEqual({ ok: true, served: true, cents: 800 });
    expect(parseZoneFee("10 reais")).toEqual({ ok: true, served: true, cents: 1000 });
  });
  it("vazio e grátis = R$ 0", () => {
    expect(parseZoneFee("")).toEqual({ ok: true, served: true, cents: 0 });
    expect(parseZoneFee("Grátis")).toEqual({ ok: true, served: true, cents: 0 });
  });
  it("entende 'não atende' e parecidos", () => {
    for (const t of ["não atende", "Não Atende", "nao entrega", "não entregamos", "-", "x", "  NÃO ATENDE  "]) {
      expect(parseZoneFee(t)).toEqual({ ok: true, served: false });
    }
  });
  it("recusa texto que não é taxa", () => {
    expect(parseZoneFee("abc")).toEqual({ ok: false });
    expect(parseZoneFee("talvez")).toEqual({ ok: false });
    expect(parseZoneFee("-5")).toEqual({ ok: false });
  });
  it("mostra bairro desligado como 'não atende'", () => {
    expect(feeInputFor({ fee_cents: 500, active: false })).toBe("não atende");
    expect(feeInputFor({ fee_cents: 500, active: true })).toBe("5,00");
    expect(feeInputFor({ fee_cents: 0, active: true })).toBe("");
  });
});
