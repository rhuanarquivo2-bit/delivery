import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

/**
 * Leitura do cardápio por foto com o Claude.
 * Cada foto (ou PDF) vai numa chamada separada, em paralelo, e o resultado é juntado.
 * Nada é gravado aqui: o operador revisa tudo antes de importar.
 */

const MODEL = "claude-opus-5-5";

const ReadSchema = z.object({
  categories: z.array(
    z.object({
      name: z.string().describe("Nome da categoria como aparece no cardápio, ex.: Pizzas, Lanches, Bebidas"),
      description: z.string().nullable(),
      sizes: z
        .array(
          z.object({
            name: z.string().describe("Ex.: Broto, Média, Grande, 300ml, 600ml"),
            max_flavors: z.number().int().describe("Quantos sabores cabem nesse tamanho; 1 se não for pizza"),
          }),
        )
        .describe("Vazio quando cada produto tem um preço só"),
      products: z.array(
        z.object({
          name: z.string(),
          description: z.string().nullable().describe("Ingredientes ou descrição, se houver"),
          price: z.number().nullable().describe("Preço em reais quando a categoria não tem tamanhos; null se ilegível"),
          size_prices: z
            .array(z.number().nullable())
            .describe("Preço em reais de cada tamanho, na mesma ordem de sizes; null quando não existe ou está ilegível"),
          uncertain: z.boolean().describe("true se algum nome ou preço deste item ficou difícil de ler"),
        }),
      ),
      addons: z
        .array(
          z.object({
            group_name: z.string().describe("Ex.: Bordas recheadas, Adicionais, Escolha o ponto"),
            options: z.array(z.object({ name: z.string(), price: z.number().describe("0 se grátis") })),
          }),
        )
        .describe("Adicionais que valem para a categoria inteira"),
    }),
  ),
  warning: z
    .string()
    .nullable()
    .describe("Aviso curto em português para o operador se a foto estiver ruim, cortada ou não for um cardápio"),
});

const SYSTEM = `Você transcreve cardápios de restaurantes brasileiros de delivery (pizzarias, hamburguerias, lanchonetes, açaí, japonês etc.) para um sistema de pedidos online.

Regras:
- Transcreva exatamente o que está escrito. Não invente produtos, preços nem descrições.
- Preços em reais como número decimal (ex.: "R$ 39,90" vira 39.9).
- Quando os produtos de uma seção têm colunas de preço por tamanho (ex.: P/M/G, Broto/Grande, 300ml/500ml), crie os tamanhos na categoria e preencha size_prices na mesma ordem. Nesse caso price fica null.
- Em pizzarias, max_flavors costuma ser 1 para broto/pequena e 2 para média/grande; use o que o cardápio disser ("até 3 sabores", "meio a meio").
- Bordas recheadas e adicionais que valem para a seção inteira vão em addons, não como produtos.
- Combos e promoções impressas entram como produtos da categoria onde aparecem.
- Marque uncertain quando algum nome ou preço daquele item estiver borrado, cortado ou ambíguo.
- Se a imagem não for um cardápio, devolva categories vazio e explique em warning.`;

export type MenuDraftProduct = {
  name: string;
  description: string;
  price_cents: number | null;
  prices: (number | null)[];
  uncertain: boolean;
};
export type MenuDraftCategory = {
  name: string;
  description: string;
  sizes: { name: string; max_flavors: number }[];
  products: MenuDraftProduct[];
  groups: { name: string; options: { name: string; price_cents: number }[] }[];
};
export type MenuDraft = { categories: MenuDraftCategory[]; warnings: string[] };

export type MenuFile = { mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif" | "application/pdf"; data: string };

export class MenuReaderError extends Error {}

const cents = (reais: number | null) => (reais === null || !Number.isFinite(reais) || reais < 0 ? null : Math.round(reais * 100));

async function readOne(client: Anthropic, file: MenuFile, index: number, total: number) {
  const source =
    file.mediaType === "application/pdf"
      ? ({ type: "document", source: { type: "base64", media_type: "application/pdf", data: file.data } } as const)
      : ({ type: "image", source: { type: "base64", media_type: file.mediaType, data: file.data } } as const);

  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(ReadSchema) },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          source,
          {
            type: "text",
            text:
              total > 1
                ? `Esta é a parte ${index + 1} de ${total} do mesmo cardápio. Transcreva o que aparece nela.`
                : "Transcreva este cardápio.",
          },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new MenuReaderError("Não foi possível ler essa imagem. Tente outra foto do cardápio.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new MenuReaderError("Essa foto tem itens demais para ler de uma vez. Tire fotos de partes menores do cardápio.");
  }
  if (!response.parsed_output) {
    throw new MenuReaderError("A leitura veio incompleta. Tente de novo.");
  }
  return response.parsed_output;
}

/** Junta as categorias com o mesmo nome (o cardápio pode estar dividido em várias fotos). */
function merge(results: z.infer<typeof ReadSchema>[]): MenuDraft {
  const categories: MenuDraftCategory[] = [];
  const warnings: string[] = [];
  for (const r of results) {
    if (r.warning) warnings.push(r.warning);
    for (const c of r.categories) {
      const sizes = c.sizes.map((s) => ({ name: s.name.trim().slice(0, 30), max_flavors: Math.min(Math.max(s.max_flavors, 1), 4) }));
      const draft: MenuDraftCategory = {
        name: c.name.trim().slice(0, 60),
        description: (c.description ?? "").trim().slice(0, 200),
        sizes,
        products: c.products
          .filter((p) => p.name.trim())
          .map((p) => ({
            name: p.name.trim().slice(0, 80),
            description: (p.description ?? "").trim().slice(0, 300),
            price_cents: sizes.length ? null : cents(p.price),
            prices: sizes.map((_, i) => cents(p.size_prices[i] ?? null)),
            uncertain: p.uncertain,
          })),
        groups: c.addons
          .filter((g) => g.options.length)
          .map((g) => ({
            name: g.group_name.trim().slice(0, 60),
            options: g.options.map((o) => ({ name: o.name.trim().slice(0, 60), price_cents: cents(o.price) ?? 0 })),
          })),
      };
      const same = categories.find(
        (x) =>
          x.name.toLowerCase() === draft.name.toLowerCase() &&
          x.sizes.map((s) => s.name.toLowerCase()).join("|") === draft.sizes.map((s) => s.name.toLowerCase()).join("|"),
      );
      if (same) {
        same.products.push(...draft.products);
        same.groups.push(...draft.groups);
      } else if (draft.products.length || draft.groups.length) {
        categories.push(draft);
      }
    }
  }
  return { categories, warnings };
}

export function isMenuReaderConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function readMenu(files: MenuFile[]): Promise<MenuDraft> {
  const client = new Anthropic();
  try {
    const results = await Promise.all(files.map((f, i) => readOne(client, f, i, files.length)));
    return merge(results);
  } catch (error) {
    if (error instanceof MenuReaderError) throw error;
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      throw new MenuReaderError("A chave da IA está inválida. Confira a variável ANTHROPIC_API_KEY.");
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new MenuReaderError("Muitas leituras ao mesmo tempo. Espere um minuto e tente de novo.");
    }
    if (error instanceof Anthropic.BadRequestError) {
      throw new MenuReaderError("A IA não conseguiu processar esse arquivo. Confira se é uma foto nítida (JPG ou PNG) e se a conta da API tem crédito.");
    }
    if (error instanceof Anthropic.APIError) {
      console.error("Leitura do cardápio falhou:", error.status, error.message);
      throw new MenuReaderError("O serviço de leitura está instável agora. Tente de novo em instantes.");
    }
    throw error;
  }
}
