import { describe, expect, it } from "vitest";
import { formatCep, matchZone, normalizePlace, resolveZone } from "../cep";

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

describe("matchZone tolerante", () => {
  const zones = [
    { name: "Jd. América" },
    { name: "Santa Teresinha" },
    { name: "Nossa Senhora das Graças" },
    { name: "Centro", aliases: ["Praia", "Vila Praia"] },
    { name: "Vila Nova" },
    { name: "Vila Nova II" },
  ];
  it("entende abreviações e ignora 'Bairro'", () => {
    expect(matchZone(zones, "Jardim America")?.name).toBe("Jd. América");
    expect(matchZone(zones, "N. Sra. das Graças")?.name).toBe("Nossa Senhora das Graças");
    expect(matchZone(zones, "Bairro Santa Teresinha")?.name).toBe("Santa Teresinha");
  });
  it("usa os outros nomes cadastrados pela loja", () => {
    expect(matchZone(zones, "Praia")?.name).toBe("Centro");
    expect(matchZone(zones, "vila praia")?.name).toBe("Centro");
  });
  it("perdoa erro de digitação pequeno", () => {
    expect(matchZone(zones, "Santa Terezinha")?.name).toBe("Santa Teresinha");
  });
  it("não chuta quando dois bairros combinam ou nada combina", () => {
    expect(matchZone(zones, "Vila Nova 2")?.name).toBe("Vila Nova II");
    expect(matchZone(zones, "Vila Nova")?.name).toBe("Vila Nova");
    expect(matchZone(zones, "Morro Alto")).toBeNull();
    expect(matchZone(zones, "Prainha")).toBeNull();
  });
});

describe("resolveZone", () => {
  const zones = [
    { name: "Centro", catchAll: false },
    { name: "Outros bairros", catchAll: true },
  ];
  it("bairro da lista > outros bairros > nenhum", () => {
    expect(resolveZone(zones, "centro")).toMatchObject({ kind: "match", zone: { name: "Centro" } });
    expect(resolveZone(zones, "Praia")).toMatchObject({ kind: "fallback", zone: { name: "Outros bairros" } });
    expect(resolveZone(zones, "")).toMatchObject({ kind: "none", zone: null });
    expect(resolveZone([zones[0]], "Praia")).toMatchObject({ kind: "none", zone: null });
  });
});
