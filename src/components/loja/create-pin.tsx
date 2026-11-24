"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { CheckCircle2, KeyRound, Loader2 } from "lucide-react";
import { createPin } from "@/app/loja/[slug]/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { pinProblem } from "@/lib/my-orders";

/** Página do pedido: cria a senha para ver os pedidos em outro aparelho. */
export function CreatePin({
  slug,
  token,
  hasPin,
  phoneEnd,
}: {
  slug: string;
  token: string;
  hasPin: boolean;
  phoneEnd: string;
}) {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const save = () => {
    const problem = pinProblem(pin);
    if (problem) return setError(problem);
    setError(null);
    startTransition(async () => {
      const r = await createPin(token, pin);
      if (!r.ok) return setError(r.message);
      setSaved(true);
      setOpen(false);
      setPin("");
    });
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5 text-sm">
      <div className="flex items-start gap-3">
        <KeyRound className="mt-0.5 size-5 shrink-0 text-brand" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Seus pedidos em qualquer aparelho</p>
          {saved ? (
            <p className="mt-1 text-emerald-700">
              <CheckCircle2 className="mr-1 inline size-4 align-[-3px]" />
              Senha salva! Em outro aparelho, entre em “Meus pedidos” com o celular
              final {phoneEnd} e essa senha.
            </p>
          ) : (
            <p className="mt-1 text-muted-foreground">
              {hasPin
                ? `O celular final ${phoneEnd} já tem senha. Esqueceu? Você pode criar outra.`
                : `Crie uma senha de 4 números para ver seus pedidos em outro celular ou no app.`}
            </p>
          )}
          {open ? (
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
            >
              <Input
                aria-label="Nova senha de 4 números"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                autoFocus
                maxLength={4}
                placeholder="••••"
                className="w-28 text-center tracking-[0.4em]"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              />
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : null} Salvar senha
              </Button>
            </form>
          ) : (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
              <button onClick={() => setOpen(true)} className="cursor-pointer font-semibold text-brand hover:underline">
                {hasPin || saved ? "Trocar senha" : "Criar senha"}
              </button>
              <Link href={`/loja/${slug}/pedidos`} className="font-semibold text-brand hover:underline">
                Ver meus pedidos
              </Link>
            </div>
          )}
          {error ? <p className="mt-2 text-red-600">{error}</p> : null}
        </div>
      </div>
    </section>
  );
}
