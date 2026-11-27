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

// Abreviações comuns em nomes de bairro (Correios, placas e o jeito que a loja digitou).
const ABBREVIATIONS: Record<string, string> = {
  jd: "jardim",
  jdm: "jardim",
  jardins: "jardim",
  vl: "vila",
  pq: "parque",
  pqe: "parque",
  res: "residencial",
  resid: "residencial",
  cj: "conjunto",
  conj: "conjunto",
  st: "setor",
  sta: "santa",
  sto: "santo",
  s: "sao",
  sr: "senhor",
  sra: "senhora",
  ns: "nossa senhora",
  nsa: "nossa senhora",
  n: "nossa",
  dr: "doutor",
  prof: "professor",
  pres: "presidente",
  gov: "governador",
  mal: "marechal",
  cel: "coronel",
  ten: "tenente",
  alt: "alto",
  lot: "loteamento",
  ch: "chacara",
  chac: "chacara",
  hab: "habitacional",
  i: "1",
  ii: "2",
  iii: "3",
  iv: "4",
  v: "5",
};
// Palavras que não ajudam a diferenciar ("Bairro da Praia" = "Praia").
const FILLER = new Set(["bairro", "de", "da", "do", "das", "dos", "e"]);

/** Nome do bairro pronto para comparar: sem acento, abreviações por extenso, sem "bairro/de/da". */
export function placeKey(value: string) {
  return normalizePlace(value)
    .split(" ")
    .flatMap((w) => (ABBREVIATIONS[w] ?? w).split(" "))
    .filter((w) => w && !FILLER.has(w))
    .join(" ");
}

/** Distância de edição (quantas letras trocar para um virar o outro). */
function editDistance(a: string, b: string) {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Só um candidato pode ganhar; empate = não decide (melhor a regra da loja do que um palpite). */
function single<T>(list: T[]) {
  return list.length === 1 ? list[0] : null;
}

export type ZoneLike = { name: string; aliases?: string[] };

/**
 * Acha o bairro de entrega da loja que corresponde ao bairro do CEP (ou ao que o cliente digitou).
 * Em ordem: nome igual (sem acento, "Jd." = "Jardim", sem "Bairro"), um dos "outros nomes" que a
 * loja cadastrou, as mesmas palavras em outra ordem, um nome que contém o outro e, por último,
 * erro de digitação pequeno ("Sta Terezinha" x "Santa Teresinha").
 */
export function matchZone<T extends ZoneLike>(zones: T[], district: string): T | null {
  const target = placeKey(district);
  if (!target) return null;
  const keyed = zones.map((zone) => ({ zone, keys: [zone.name, ...(zone.aliases ?? [])].map(placeKey).filter(Boolean) }));

  const exact = single(keyed.filter((k) => k.keys.includes(target)));
  if (exact) return exact.zone;

  const sorted = (v: string) => v.split(" ").sort().join(" ");
  const sameWords = single(keyed.filter((k) => k.keys.some((key) => sorted(key) === sorted(target))));
  if (sameWords) return sameWords.zone;

  // o pedaço em comum precisa ser grande o bastante ("Vila" sozinho não decide nada)
  const contains = single(
    keyed.filter((k) =>
      k.keys.some((key) => Math.min(key.length, target.length) >= 6 && (key.includes(target) || target.includes(key))),
    ),
  );
  if (contains) return contains.zone;

  // erro de digitação: no máximo 1 letra a cada 6 (e só se nenhum outro bairro chegar perto)
  const scored = keyed
    .map((k) => ({ zone: k.zone, d: Math.min(...k.keys.map((key) => editDistance(key, target))) }))
    .filter((s) => target.length >= 5 && s.d <= Math.floor(target.length / 6));
  const best = Math.min(...scored.map((s) => s.d));
  const typo = single(scored.filter((s) => s.d === best));
  return typo ? typo.zone : null;
}

/**
 * Qual bairro de entrega vale para o endereço: o que combina com o nome do bairro; senão,
 * "outros bairros" (se a loja cobra uma taxa para quem não está na lista); senão, nenhum.
 */
export function resolveZone<T extends ZoneLike & { catchAll?: boolean }>(zones: T[], district: string) {
  const listed = zones.filter((z) => !z.catchAll);
  const match = matchZone(listed, district);
  if (match) return { zone: match, kind: "match" as const };
  const fallback = zones.find((z) => z.catchAll);
  if (fallback && placeKey(district)) return { zone: fallback, kind: "fallback" as const };
  return { zone: null, kind: "none" as const };
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
