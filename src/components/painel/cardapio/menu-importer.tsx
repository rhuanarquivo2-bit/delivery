"use client";

import { useRef, useState, useTransition } from "react";
import { AlertTriangle, Camera, FileText, ImagePlus, Loader2, Sparkles, Trash2, X } from "lucide-react";
import { importMenu, readMenuPhotos } from "@/app/painel/cardapio/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { MenuDraft, MenuDraftCategory, MenuDraftProduct } from "@/lib/menu-reader";
import { cn, formatBRL, parseBRLToCents } from "@/lib/utils";

const MAX_FILES = 4;
const MAX_SIDE = 2000;

type Picked = { key: string; file: File; url: string; pdf: boolean };
type ReviewProduct = MenuDraftProduct & { key: string; include: boolean };
type ReviewCategory = Omit<MenuDraftCategory, "products"> & { key: string; include: boolean; products: ReviewProduct[] };

let seq = 0;
const nextKey = () => `k${++seq}`;

const moneyText = (cents: number | null) => (cents === null ? "" : formatBRL(cents).replace(/^R\$\s?/, ""));

/** Reduz fotos grandes do celular antes de enviar (a IA lê bem até ~2000px). */
async function shrink(file: File): Promise<Blob> {
  if (file.type === "application/pdf") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1.5 * 1024 * 1024 && ["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/jpeg", 0.85),
    );
  } catch {
    return file;
  }
}

function toReview(draft: MenuDraft): ReviewCategory[] {
  return draft.categories.map((c) => ({
    ...c,
    key: nextKey(),
    include: true,
    products: c.products.map((p) => ({ ...p, key: nextKey(), include: true })),
  }));
}

export function MenuImporter({ configured }: { configured: boolean }) {
  const [files, setFiles] = useState<Picked[]>([]);
  const [current, setCurrent] = useState(0);
  const [categories, setCategories] = useState<ReviewCategory[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [publish, setPublish] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reading, startReading] = useTransition();
  const [importing, startImport] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setError(null);
    const accepted = Array.from(list).filter((f) => f.type.startsWith("image/") || f.type === "application/pdf");
    const room = Math.max(MAX_FILES - files.length, 0);
    if (accepted.length > room) setError(`Dá para enviar até ${MAX_FILES} fotos por vez.`);
    const added = accepted.slice(0, room).map((file) => ({
      key: nextKey(),
      file,
      url: URL.createObjectURL(file),
      pdf: file.type === "application/pdf",
    }));
    setFiles((prev) => [...prev, ...added]);
  };

  const removeFile = (key: string) => {
    const f = files.find((x) => x.key === key);
    if (f) URL.revokeObjectURL(f.url);
    setFiles((prev) => prev.filter((x) => x.key !== key));
    setCurrent(0);
  };

  const read = () => {
    setError(null);
    startReading(async () => {
      const data = new FormData();
      for (const f of files) {
        const blob = await shrink(f.file);
        const name = blob === f.file ? f.file.name : f.file.name.replace(/\.\w+$/, "") + ".jpg";
        data.append("files", blob, name);
      }
      const result = await readMenuPhotos(data);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setCategories(toReview(result.draft));
      setWarnings(result.draft.warnings);
      setCurrent(0);
    });
  };

  // ---- edição da revisão ----
  const updateCategory = (key: string, patch: Partial<ReviewCategory>) =>
    setCategories((cats) => cats!.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  const updateProduct = (catKey: string, prodKey: string, patch: Partial<ReviewProduct>) =>
    setCategories((cats) =>
      cats!.map((c) =>
        c.key === catKey ? { ...c, products: c.products.map((p) => (p.key === prodKey ? { ...p, ...patch } : p)) } : c,
      ),
    );
  const removeSize = (catKey: string, index: number) =>
    setCategories((cats) =>
      cats!.map((c) =>
        c.key === catKey
          ? {
              ...c,
              sizes: c.sizes.filter((_, i) => i !== index),
              products: c.products.map((p) => {
                const prices = p.prices.filter((_, i) => i !== index);
                // sem tamanhos, o produto passa a ter preço único (o primeiro que sobrou)
                return c.sizes.length === 1 ? { ...p, prices: [], price_cents: p.prices[0] ?? null } : { ...p, prices };
              }),
            }
          : c,
      ),
    );

  const selected = (categories ?? []).filter((c) => c.include);
  const productCount = selected.reduce((n, c) => n + c.products.filter((p) => p.include).length, 0);
  const missingPrice = (c: ReviewCategory, p: ReviewProduct) =>
    c.sizes.length ? !p.prices.some((x) => x !== null) : p.price_cents === null;

  const doImport = () => {
    setError(null);
    startImport(async () => {
      const result = await importMenu({
        publish,
        categories: selected.map((c) => ({
          name: c.name,
          description: c.description,
          sizes: c.sizes,
          groups: c.groups,
          products: c.products
            .filter((p) => p.include)
            .map((p) => ({ name: p.name, description: p.description, price_cents: p.price_cents, prices: p.prices })),
        })),
      });
      if (result && !result.ok) setError(result.message);
    });
  };

  if (!configured) {
    return (
      <Alert tone="info">
        A leitura por foto ainda não está ativa nesta instalação. Para ativar, crie uma chave em console.anthropic.com e
        cadastre como <code className="font-mono">ANTHROPIC_API_KEY</code> nas variáveis de ambiente da Vercel. Enquanto
        isso, você pode montar o cardápio à mão.
      </Alert>
    );
  }

  const viewer = files[current] ?? files[0];

  // ---------------------------------------------------------------- etapa 1
  if (!categories) {
    return (
      <div className="grid max-w-3xl gap-5">
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Card className="p-5 sm:p-6">
          <input
            ref={inputRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          {files.length === 0 ? (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex w-full cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border px-6 py-14 text-center transition hover:border-brand hover:bg-brand/5"
            >
              <span className="flex size-14 items-center justify-center rounded-2xl bg-brand/10 text-brand">
                <Camera className="size-7" />
              </span>
              <span className="text-lg font-semibold">Tirar foto ou escolher arquivo</span>
              <span className="max-w-sm text-sm text-muted-foreground">
                Até {MAX_FILES} fotos (frente e verso, páginas) ou um PDF. Fotografe de frente, com boa luz e sem cortar os
                preços.
              </span>
            </button>
          ) : (
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {files.map((f) => (
                  <div key={f.key} className="relative aspect-[3/4] overflow-hidden rounded-xl border border-border bg-muted">
                    {f.pdf ? (
                      <div className="flex size-full flex-col items-center justify-center gap-2 p-2 text-center text-xs text-muted-foreground">
                        <FileText className="size-8" />
                        <span className="line-clamp-2 break-all">{f.file.name}</span>
                      </div>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:)
                      <img src={f.url} alt="" className="size-full object-cover" />
                    )}
                    <button
                      type="button"
                      aria-label="Remover"
                      onClick={() => removeFile(f.key)}
                      disabled={reading}
                      className="absolute right-1.5 top-1.5 flex size-7 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ))}
                {files.length < MAX_FILES ? (
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    disabled={reading}
                    className="flex aspect-[3/4] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-sm text-muted-foreground hover:border-brand hover:text-brand"
                  >
                    <ImagePlus className="size-6" /> Adicionar
                  </button>
                ) : null}
              </div>
              <Button size="lg" onClick={read} disabled={reading} className="w-full sm:w-auto sm:justify-self-start">
                {reading ? <Loader2 className="animate-spin" /> : <Sparkles />}
                {reading ? "Lendo o cardápio..." : "Ler cardápio com IA"}
              </Button>
              {reading ? (
                <p className="text-sm text-muted-foreground">
                  Isso costuma levar de 20 segundos a 1 minuto. Pode deixar esta tela aberta.
                </p>
              ) : null}
            </div>
          )}
        </Card>
        <p className="text-xs text-muted-foreground">
          As fotos são enviadas para a IA só para a leitura e não ficam salvas. Nada entra no seu cardápio antes de você
          revisar.
        </p>
      </div>
    );
  }

  // ---------------------------------------------------------------- etapa 2
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <aside className="lg:sticky lg:top-4 lg:self-start">
        <Card className="overflow-hidden">
          {viewer ? (
            viewer.pdf ? (
              <div className="flex aspect-[3/4] flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                <FileText className="size-10" />
                <a href={viewer.url} target="_blank" rel="noreferrer" className="font-medium text-brand hover:underline">
                  Abrir PDF
                </a>
              </div>
            ) : (
              <a href={viewer.url} target="_blank" rel="noreferrer" title="Abrir em tamanho real">
                {/* eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:) */}
                <img src={viewer.url} alt="Foto do cardápio" className="max-h-[75vh] w-full bg-muted object-contain" />
              </a>
            )
          ) : null}
          {files.length > 1 ? (
            <div className="flex gap-2 border-t border-border p-2">
              {files.map((f, i) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setCurrent(i)}
                  className={cn(
                    "h-9 cursor-pointer rounded-lg px-3 text-sm font-medium",
                    i === current ? "bg-brand text-brand-foreground" : "bg-muted",
                  )}
                >
                  Foto {i + 1}
                </button>
              ))}
            </div>
          ) : null}
        </Card>
        <p className="mt-2 text-xs text-muted-foreground">Compare com a foto e corrija o que a IA leu errado.</p>
      </aside>

      <div className="grid gap-5">
        {warnings.map((w) => (
          <Alert key={w} tone="info">
            {w}
          </Alert>
        ))}

        {categories.map((c) => (
          <Card key={c.key} className={cn("overflow-hidden", !c.include && "opacity-60")}>
            <div className="grid gap-3 border-b border-border bg-muted/40 p-4">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={c.include}
                  onChange={(e) => updateCategory(c.key, { include: e.target.checked })}
                  aria-label={`Importar ${c.name}`}
                  className="size-5 shrink-0 accent-[var(--brand)]"
                />
                <Input
                  value={c.name}
                  maxLength={60}
                  onChange={(e) => updateCategory(c.key, { name: e.target.value })}
                  className="h-10 font-semibold"
                  aria-label="Nome da categoria"
                />
              </div>
              {c.sizes.length ? (
                <div className="flex flex-wrap items-center gap-2 pl-8 text-sm">
                  <span className="text-muted-foreground">Tamanhos:</span>
                  {c.sizes.map((s, i) => (
                    <span key={i} className="flex items-center gap-1 rounded-xl border border-border bg-background p-1 pl-2">
                      <input
                        value={s.name}
                        maxLength={30}
                        aria-label="Nome do tamanho"
                        onChange={(e) =>
                          updateCategory(c.key, {
                            sizes: c.sizes.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                          })
                        }
                        className="w-20 bg-transparent text-sm font-medium outline-none"
                      />
                      <select
                        value={s.max_flavors}
                        aria-label="Sabores"
                        onChange={(e) =>
                          updateCategory(c.key, {
                            sizes: c.sizes.map((x, j) => (j === i ? { ...x, max_flavors: Number(e.target.value) } : x)),
                          })
                        }
                        className="rounded-lg bg-muted px-1 py-0.5 text-xs"
                      >
                        {[1, 2, 3, 4].map((n) => (
                          <option key={n} value={n}>
                            {n === 1 ? "1 sabor" : `até ${n} sabores`}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        aria-label={`Remover tamanho ${s.name}`}
                        onClick={() => removeSize(c.key, i)}
                        className="cursor-pointer rounded-md p-1 text-muted-foreground hover:text-red-600"
                      >
                        <X className="size-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            <ul className="divide-y divide-border">
              {c.products.map((p) => {
                const noPrice = missingPrice(c, p);
                return (
                  <li key={p.key} className={cn("grid gap-2 p-4", !p.include && "opacity-50")}>
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={p.include}
                        disabled={!c.include}
                        onChange={(e) => updateProduct(c.key, p.key, { include: e.target.checked })}
                        aria-label={`Importar ${p.name}`}
                        className="mt-3 size-4 shrink-0 accent-[var(--brand)]"
                      />
                      <div className="grid min-w-0 flex-1 gap-2">
                        <Input
                          value={p.name}
                          maxLength={80}
                          aria-label="Nome do produto"
                          onChange={(e) => updateProduct(c.key, p.key, { name: e.target.value })}
                          className="h-10 font-medium"
                        />
                        <Input
                          value={p.description}
                          maxLength={300}
                          placeholder="Descrição (opcional)"
                          aria-label="Descrição"
                          onChange={(e) => updateProduct(c.key, p.key, { description: e.target.value })}
                          className="h-9 text-xs"
                        />
                        <div className="flex flex-wrap gap-2">
                          {c.sizes.length ? (
                            c.sizes.map((s, i) => (
                              <PriceInput
                                key={`${i}-${c.sizes.length}`}
                                label={s.name}
                                cents={p.prices[i] ?? null}
                                warn={noPrice}
                                onChange={(cents) =>
                                  updateProduct(c.key, p.key, {
                                    prices: c.sizes.map((_, j) => (j === i ? cents : (p.prices[j] ?? null))),
                                  })
                                }
                              />
                            ))
                          ) : (
                            <PriceInput
                              label="Preço"
                              cents={p.price_cents}
                              warn={noPrice}
                              onChange={(cents) => updateProduct(c.key, p.key, { price_cents: cents })}
                            />
                          )}
                        </div>
                        {p.include && (noPrice || p.uncertain) ? (
                          <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700">
                            <AlertTriangle className="size-3.5" />
                            {noPrice ? "Preço não encontrado na foto. Preencha ou desmarque." : "A foto estava difícil de ler aqui. Confira."}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            {c.groups.map((g, gi) => (
              <div key={gi} className="grid gap-2 border-t border-border bg-muted/20 p-4 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Adicionais:</span>
                  <input
                    value={g.name}
                    maxLength={60}
                    aria-label="Nome do grupo de adicionais"
                    onChange={(e) =>
                      updateCategory(c.key, {
                        groups: c.groups.map((x, j) => (j === gi ? { ...x, name: e.target.value } : x)),
                      })
                    }
                    className="min-w-0 flex-1 bg-transparent font-semibold outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => updateCategory(c.key, { groups: c.groups.filter((_, j) => j !== gi) })}
                    className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground hover:text-red-600"
                  >
                    <Trash2 className="size-3.5" /> Remover grupo
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {g.options.map((o, oi) => (
                    <PriceInput
                      key={oi}
                      label={o.name}
                      cents={o.price_cents}
                      onChange={(cents) =>
                        updateCategory(c.key, {
                          groups: c.groups.map((x, j) =>
                            j === gi
                              ? { ...x, options: x.options.map((y, k) => (k === oi ? { ...y, price_cents: cents ?? 0 } : y)) }
                              : x,
                          ),
                        })
                      }
                    />
                  ))}
                </div>
              </div>
            ))}
          </Card>
        ))}

        {error ? <Alert tone="error">{error}</Alert> : null}

        <Card className="grid gap-4 p-5">
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={!publish}
              onChange={(e) => setPublish(!e.target.checked)}
              className="mt-0.5 size-4 accent-[var(--brand)]"
            />
            <span>
              <span className="font-medium">Importar pausado</span>
              <span className="block text-muted-foreground">
                As categorias entram escondidas do site até você ativar no cardápio.
              </span>
            </span>
          </label>
          <div className="flex flex-wrap gap-3">
            <Button size="lg" onClick={doImport} disabled={importing || productCount === 0}>
              {importing ? <Loader2 className="animate-spin" /> : null}
              {importing
                ? "Importando..."
                : `Adicionar ${productCount} ${productCount === 1 ? "produto" : "produtos"} ao cardápio`}
            </Button>
            <Button
              size="lg"
              variant="ghost"
              disabled={importing}
              onClick={() => {
                setCategories(null);
                setWarnings([]);
                setError(null);
              }}
            >
              Ler outras fotos
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function PriceInput({
  label,
  cents,
  warn,
  onChange,
}: {
  label: string;
  cents: number | null;
  warn?: boolean;
  onChange: (cents: number | null) => void;
}) {
  return (
    <label
      className={cn(
        "flex h-9 items-center gap-1.5 rounded-xl border bg-background pl-2.5 pr-1 text-xs",
        warn && cents === null ? "border-amber-400 bg-amber-50" : "border-border",
      )}
    >
      <span className="max-w-28 truncate text-muted-foreground">{label}</span>
      <span className="text-muted-foreground">R$</span>
      <input
        defaultValue={moneyText(cents)}
        inputMode="decimal"
        placeholder="0,00"
        onChange={(e) => onChange(e.target.value.trim() ? parseBRLToCents(e.target.value) : null)}
        className="w-16 bg-transparent text-sm font-medium outline-none"
      />
    </label>
  );
}
