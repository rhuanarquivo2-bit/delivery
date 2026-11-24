import { describe, expect, it } from "vitest";
import { formatCpf, isValidDocument } from "../document";

describe("isValidDocument", () => {
  it("aceita CPF e CNPJ válidos", () => {
    expect(isValidDocument("529.982.247-25")).toBe(true);
    expect(isValidDocument("11.222.333/0001-81")).toBe(true);
  });
  it("recusa dígito errado, repetidos e tamanho errado", () => {
    expect(isValidDocument("529.982.247-24")).toBe(false);
    expect(isValidDocument("111.111.111-11")).toBe(false);
    expect(isValidDocument("1234")).toBe(false);
  });
});

describe("formatCpf", () => {
  it("formata enquanto digita", () => {
    expect(formatCpf("529")).toBe("529");
    expect(formatCpf("5299822")).toBe("529.982.2");
    expect(formatCpf("52998224725")).toBe("529.982.247-25");
  });
});
