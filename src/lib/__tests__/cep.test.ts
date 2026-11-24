import { describe, expect, it } from "vitest";
import { formatCep, matchZone, normalizePlace } from "../cep";

describe("formatCep", () => {
  it("põe o hífen", () => {
    expect(formatCep("01310100")).toBe("01310-100");
    expect(formatCep("0131")).toBe("0131");
    expect(formatCep("01310-1009")).toBe("01310-100");
  });
});

describe("matchZone", () => {
  const zones = [{ name: "Centro" }, { name: "Jardim Paulista" }, { name: "Vila Nova" }, { name: "São José" }];
  it("ignora acento e maiúsculas", () => {
    expect(normalizePlace("  São  José ")).toBe("sao jose");
    expect(matchZone(zones, "SAO JOSE")).toEqual({ name: "São José" });
  });
  it("aceita nome contido quando só um bairro combina", () => {
    expect(matchZone(zones, "Jardim Paulista II")).toEqual({ name: "Jardim Paulista" });
    expect(matchZone(zones, "Vila")).toBeNull();
    expect(matchZone(zones, "Bela Vista")).toBeNull();
    expect(matchZone(zones, "")).toBeNull();
  });
});
