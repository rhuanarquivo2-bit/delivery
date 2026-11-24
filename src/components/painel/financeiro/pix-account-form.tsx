"use client";

import { useActionState, useState, useTransition } from "react";
import { CheckCircle2, ExternalLink } from "lucide-react";
import { connectPixAccount, disconnectPixAccount, type ConnectState } from "@/app/painel/financeiro/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Provider = "mercadopago" | "asaas";
type Account = { provider: Provider; account_label: string | null; live_mode: boolean; connected_at: string } | null;

const PROVIDERS: Record<
  Provider,
  { name: string; tokenLabel: string; placeholder: string; link: string; steps: string[]; notes: string[] }
> = {
  mercadopago: {
    name: "Mercado Pago",
    tokenLabel: "Access Token de produção",
    placeholder: "APP_USR-...",
    link: "https://www.mercadopago.com.br/developers/panel/app",
    steps: [
      "Entre em Mercado Pago Developers com a conta da loja e clique em Criar aplicação.",
      "Escolha Pagamentos online e a integração Checkout Transparente (ou Checkout API).",
      "Abra Credenciais de produção, ative-as se pedir, e copie o Access Token (começa com APP_USR-).",
      "Cole aqui embaixo e clique em Conectar.",
    ],
    notes: ["A conta precisa ter uma chave Pix cadastrada.", "A taxa por Pix é a da sua conta no Mercado Pago."],
  },
  asaas: {
    name: "Asaas",
    tokenLabel: "Chave de API",
    placeholder: "$aact_prod_...",
    link: "https://www.asaas.com/customerApiAccessToken/index",
    steps: [
      "Entre no Asaas com a conta da loja e abra Integrações > Chaves de API.",
      "Gere uma nova chave e copie (ela começa com $aact_ e só aparece uma vez).",
      "Cole aqui embaixo e clique em Conectar. O aviso automático de pagamento é ativado sozinho.",
    ],
    notes: [
      "A conta precisa ter uma chave Pix cadastrada (Pix > Minhas chaves).",
      "O Asaas exige o CPF de quem paga: o site pede o CPF quando o cliente escolhe Pix.",
      "A taxa por Pix é a do seu plano no Asaas.",
    ],
  },
};

export function PixAccountForm({ account }: { account: Account }) {
  const [editing, setEditing] = useState(!account);
  const [state, action, pending] = useActionState<ConnectState, FormData>(async (prev, formData) => {
    const result = await connectPixAccount(prev, formData);
    if (result.ok) setEditing(false);
    return result;
  }, {});
  const [provider, setProvider] = useState<Provider>(account?.provider ?? "mercadopago");
  const [disconnecting, startDisconnect] = useTransition();
  const [disconnectState, setDisconnectState] = useState<ConnectState>({});
  const info = PROVIDERS[provider];
  const connected = editing ? null : account;

  return (
    <div className="grid gap-6">
      {state.message ? <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert> : null}
      {state.warning ? <Alert tone="info">{state.warning}</Alert> : null}
      {disconnectState.message ? (
        <Alert tone={disconnectState.ok ? "success" : "error"}>{disconnectState.message}</Alert>
      ) : null}

      {connected ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="size-6 text-emerald-600" />
              <div>
                <p className="font-semibold">
                  Recebendo Pix pelo {PROVIDERS[connected.provider].name}
                  {!connected.live_mode ? (
                    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                      modo de testes
                    </span>
                  ) : null}
                </p>
                <p className="text-sm text-muted-foreground">
                  {connected.account_label} · conectada em{" "}
                  {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" }).format(
                    new Date(connected.connected_at),
                  )}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditing(true)}>
                Trocar conta
              </Button>
              <Button
                variant="ghost"
                className="text-red-600"
                disabled={disconnecting}
                onClick={() =>
                  startDisconnect(async () => {
                    setDisconnectState(await disconnectPixAccount());
                    setEditing(true);
                  })
                }
              >
                {disconnecting ? "..." : "Desconectar"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Onde a loja recebe</CardTitle>
            <CardDescription>Escolha a conta que a loja já usa. Dá para trocar depois.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={action} className="grid gap-5">
              <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Conta de recebimento">
                {(Object.keys(PROVIDERS) as Provider[]).map((p) => (
                  <label
                    key={p}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm font-semibold",
                      provider === p ? "border-brand bg-brand/5 ring-2 ring-brand/20" : "border-border hover:bg-muted",
                    )}
                  >
                    <input
                      type="radio"
                      name="provider"
                      value={p}
                      checked={provider === p}
                      onChange={() => setProvider(p)}
                      className="size-4 accent-[var(--brand)]"
                    />
                    {PROVIDERS[p].name}
                  </label>
                ))}
              </div>

              <div className="grid gap-2 rounded-xl bg-muted/60 p-4 text-sm">
                <p className="font-semibold">Como pegar a chave no {info.name}</p>
                <ol className="grid list-decimal gap-1 pl-5">
                  {info.steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
                <a
                  href={info.link}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-semibold text-brand hover:underline"
                >
                  Abrir o {info.name} <ExternalLink className="size-3.5" />
                </a>
                <ul className="mt-1 grid list-disc gap-1 pl-5 text-muted-foreground">
                  {info.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </div>

              <Field label={info.tokenLabel} htmlFor="token" hint="Fica guardada só no servidor. Ninguém da equipe consegue ver.">
                <Input id="token" name="token" type="password" autoComplete="off" placeholder={info.placeholder} required />
              </Field>

              <div className="flex gap-2">
                <Button type="submit" disabled={pending}>
                  {pending ? "Conferindo a conta..." : "Conectar"}
                </Button>
                {account ? (
                  <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                    Cancelar
                  </Button>
                ) : null}
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
