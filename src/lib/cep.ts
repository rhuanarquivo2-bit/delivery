/** "01310100" -> "01310-100" (aceita digitação parcial). */
export function formatCep(value: string) {
  const d = value.replace(/\D/g, "").slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/** Para comparar nomes de bairro: sem acento, sem caixa, sem espaços repetidos. */
export function normalizePlace(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Acha o bairro de entrega da loja que corresponde ao bairro do CEP.
 * Primeiro o nome igual; depois um que contenha o outro ("Jardim Paulista" x "Jd. Paulista" não entra).
 */
export function matchZone<T extends { name: string }>(zones: T[], district: string): T | null {
  const target = normalizePlace(district);
  if (!target) return null;
  const exact = zones.find((z) => normalizePlace(z.name) === target);
  if (exact) return exact;
  const partial = zones.filter((z) => {
    const name = normalizePlace(z.name);
    // o pedaço em comum precisa ser grande o bastante ("Vila" sozinho não decide nada)
    return Math.min(name.length, target.length) >= 6 && (name.includes(target) || target.includes(name));
  });
  return partial.length === 1 ? partial[0] : null;
}

export type CepAddress = { street: string; district: string; city: string; state: string };

/** Consulta o CEP no ViaCEP (gratuito, direto do navegador do cliente). null = não encontrado. */
export async function lookupCep(cep: string, signal?: AbortSignal): Promise<CepAddress | null> {
  const digits = cep.replace(/\D/g, "");
  if (digits.length !== 8) return null;
  const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`, { signal });
  if (!res.ok) return null;
  const data = (await res.json()) as { erro?: boolean | string; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
  if (data.erro) return null;
  return {
    street: data.logradouro ?? "",
    district: data.bairro ?? "",
    city: data.localidade ?? "",
    state: data.uf ?? "",
  };
}
