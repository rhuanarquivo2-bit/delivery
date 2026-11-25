import { Clock, Lock, MessageCircle } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { daysLeftLabel, formatAccessDate, whatsappLink, type AccessState } from "@/lib/access";
import { APP_NAME } from "@/lib/brand";

/** Tela no lugar do painel quando o acesso venceu ou foi bloqueado. */
export function AccessSuspended({
  access,
  storeName,
  supportWhatsapp,
}: {
  access: Extract<AccessState, { kind: "expired" | "blocked" }>;
  storeName: string;
  supportWhatsapp: string | null;
}) {
  const blocked = access.kind === "blocked";
  const contact = whatsappLink(
    supportWhatsapp,
    `Olá! Quero ${blocked ? "desbloquear" : "renovar"} o acesso da loja ${storeName} no ${APP_NAME}.`,
  );
  return (
    <div className="mx-auto max-w-lg py-10 text-center" data-access-suspended>
      <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-red-50 text-red-600">
        {blocked ? <Lock className="size-6" /> : <Clock className="size-6" />}
      </div>
      <h1 className="mt-5 text-2xl font-bold tracking-tight">
        {blocked ? "Acesso suspenso" : "Seu período de acesso terminou"}
      </h1>
      <p className="mt-2 text-muted-foreground">
        {blocked
          ? "O acesso da sua loja ao sistema foi suspenso."
          : `O acesso da sua loja venceu em ${formatAccessDate(access.until)}.`}{" "}
        Enquanto isso, o site da loja fica indisponível e não recebe pedidos. Seus dados continuam guardados.
      </p>
      {blocked && access.reason ? (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{access.reason}</p>
      ) : null}
      {contact ? (
        <a href={contact} target="_blank" rel="noreferrer" className={buttonVariants({ className: "mt-6" })}>
          <MessageCircle /> Falar no WhatsApp para liberar
        </a>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">Fale com o suporte do {APP_NAME} para liberar.</p>
      )}
    </div>
  );
}

/** Faixa no topo do painel quando faltam poucos dias para vencer. */
export function AccessEndingBar({ until, daysLeft, supportWhatsapp, storeName }: { until: Date; daysLeft: number; supportWhatsapp: string | null; storeName: string }) {
  const contact = whatsappLink(supportWhatsapp, `Olá! Quero renovar o acesso da loja ${storeName} no ${APP_NAME}.`);
  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 md:px-8" data-access-ending>
      <Clock className="mr-1.5 inline size-4 align-[-3px]" />
      Seu acesso termina <strong>{daysLeftLabel(daysLeft)}</strong> ({formatAccessDate(until)}). Depois disso o site
      deixa de receber pedidos.{" "}
      {contact ? (
        <a href={contact} target="_blank" rel="noreferrer" className="font-semibold underline">
          Renovar pelo WhatsApp
        </a>
      ) : null}
    </div>
  );
}
