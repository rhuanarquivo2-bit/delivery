import { afterEach, describe, expect, it, vi } from "vitest";
import { formatBRL, parseBRLToCents, slugify } from "../utils";

describe("dinheiro", () => {
  it("converte texto em centavos", () => {
    expect(parseBRLToCents("19,90")).toBe(1990);
    expect(parseBRLToCents("19.90")).toBe(1990);
    expect(parseBRLToCents("R$ 1.234,50")).toBe(123450);
    expect(parseBRLToCents("5")).toBe(500);
    expect(parseBRLToCents("abc")).toBeNull();
    expect(parseBRLToCents("-3")).toBeNull();
  });

  it("formata em reais", () => {
    expect(formatBRL(1990).replace(/\s/g, " ")).toBe("R$ 19,90");
  });
});

describe("slugify", () => {
  it("gera endereço sem acentos", () => {
    expect(slugify("Pizzaria do João!")).toBe("pizzaria-do-joao");
    expect(slugify("  Hambúrguer & Cia  ")).toBe("hamburguer-cia");
  });
});

describe("storeSlugFromHost", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("lê o subdomínio da loja", async () => {
    vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", "suamarca.com.br");
    const { storeSlugFromHost } = await import("../tenant");
    expect(storeSlugFromHost("pizzaria.suamarca.com.br")).toBe("pizzaria");
    expect(storeSlugFromHost("pizzaria.localhost:3000")).toBe("pizzaria");
    expect(storeSlugFromHost("www.suamarca.com.br")).toBeNull();
    expect(storeSlugFromHost("suamarca.com.br")).toBeNull();
    expect(storeSlugFromHost("a.b.suamarca.com.br")).toBeNull();
    expect(storeSlugFromHost("outrosite.com")).toBeNull();
  });
});
