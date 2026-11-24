"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { checkPixPayment } from "@/app/loja/[slug]/actions";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/utils";

/** QR Code + copia e cola. Confere o pagamento sozinho a cada 5 segundos. */
export function PixPayment({
  token,
  qrCode,
  qrBase64,
  expiresAt,
  totalCents,
}: {
  token: string;
  qrCode: string;
  qrBase64: string | null;
  expiresAt: string;
  totalCents: number;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [notYet, setNotYet] = useState(false);
  const [checking, startCheck] = useTransition();
  const left = Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000));

  const check = useCallback(async () => {
    const status = await checkPixPayment(token);
    if (status && status !== "awaiting") router.refresh();
    return status;
  }, [token, router]);

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") void check();
    }, 5000);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(poll);
    };
  }, [check]);

  // Acabou o prazo: confere uma última vez (cancela se não pagou).
  useEffect(() => {
    if (left === 0) void check();
  }, [left, check]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(qrCode);
    } catch {
      const area = document.getElementById("pix-code") as HTMLTextAreaElement | null;
      area?.select();
      document.execCommand("copy");
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  };

  return (
    <section className="grid gap-4 rounded-2xl border-2 border-brand bg-card p-5 text-center">
      <div>
        <h2 className="text-lg font-bold">Pague {formatBRL(totalCents)} com Pix</h2>
        <p className="text-sm text-muted-foreground">
          Abra o app do seu banco, escolha Pix copia e cola (ou leia o QR Code) e confirme.
        </p>
      </div>

      <Button size="lg" onClick={copy} className="h-14 text-base">
        {copied ? <Check /> : <Copy />}
        {copied ? "Código copiado!" : "Copiar código Pix"}
      </Button>

      {qrBase64 ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`data:image/png;base64,${qrBase64}`}
          alt="QR Code do Pix"
          className="mx-auto size-56 rounded-xl border border-border bg-white p-2"
        />
      ) : null}

      <textarea
        id="pix-code"
        readOnly
        value={qrCode}
        rows={3}
        onFocus={(e) => e.currentTarget.select()}
        className="w-full resize-none rounded-xl border border-border bg-muted/60 p-3 font-mono text-xs break-all"
        aria-label="Código Pix copia e cola"
      />

      <p className="flex items-center justify-center gap-2 text-sm font-medium" aria-live="polite">
        <Loader2 className="size-4 animate-spin text-brand" />
        {left > 0
          ? `Aguardando o pagamento · ${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`
          : "Conferindo o pagamento..."}
      </p>

      <Button
        variant="outline"
        disabled={checking}
        onClick={() =>
          startCheck(async () => {
            const status = await check();
            setNotYet(status === "awaiting");
          })
        }
      >
        {checking ? "Conferindo..." : "Já paguei"}
      </Button>
      {notYet ? (
        <p className="text-sm text-muted-foreground">
          Ainda não recebemos a confirmação do banco. Às vezes leva alguns segundos; esta página atualiza sozinha.
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        O pedido só vai para a loja depois do pagamento. Se o prazo acabar, ele é cancelado e nada é cobrado.
      </p>
    </section>
  );
}
