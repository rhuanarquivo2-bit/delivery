import { describe, expect, it } from "vitest";
import { normalizeSupabaseUrl } from "../env";

describe("normalizeSupabaseUrl", () => {
  const base = "https://abc.supabase.co";
  it("mantém a URL certa", () => expect(normalizeSupabaseUrl(base)).toBe(base));
  it("tira /rest/v1 e /auth/v1", () => {
    expect(normalizeSupabaseUrl(`${base}/rest/v1/`)).toBe(base);
    expect(normalizeSupabaseUrl(`${base}/rest/v1`)).toBe(base);
    expect(normalizeSupabaseUrl(`${base}/auth/v1/signup`)).toBe(base);
  });
  it("tira barra no final e espaços", () => expect(normalizeSupabaseUrl(`  ${base}/ `)).toBe(base));
  it("vazio continua vazio", () => expect(normalizeSupabaseUrl(undefined)).toBe(""));
});
