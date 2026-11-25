"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CheckCircle2, MessageCircle } from "lucide-react";
import { pixWhatsappMessage, storeWhatsappUrl, type PixWhatsappOrder } from "@/lib/pix-whatsapp";

const noSubscribe = () => () => {};

/**
 * Pix pelo WhatsApp: logo depois do pedido, abre o WhatsApp da loja com o pedido pronto
 * pedindo a chave Pix. Se o celular bloquear a abertura automática (iPhone, app instalado),
 * o botão grande faz a mesma coisa.
 */
export function PixWhatsappBox({
  whatsapp,
  order,
  autoOpen,
  paid,
}: {
  whatsapp: string;
  order: Omit<PixWhatsappOrder, "link">;
  autoOpen: boolean;
  paid: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const origin = useSyncExternalStore(noSubscribe, () => window.location.origin, () => null);
  // Endereço desta página (sem o "?whatsapp=1"), para a loja também conseguir abrir o pedido.
  const link = origin ? `${origin}${pathname}` : null;
  const [opening, setOpening] = useState(autoOpen && !paid);

  const href = useMemo(() => storeWhatsappUrl(whatsapp, pixWhatsappMessage({ ...order, link })), [whatsapp, order, link]);

  useEffect(() => {
    if (!autoOpen || paid || !link) return;
    // Tira o "?whatsapp=1" do endereço antes de sair: voltando para cá, não abre de novo.
    router.replace(pathname, { scroll: false });
    const timer = window.setTimeout(() => {
      window.location.href = href;
    }, 600);
    const stop = window.setTimeout(() => setOpening(false), 4000);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(stop);
    };
    // só na primeira vez que a página abre
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [link]);

  if (paid) {
    return (
      <section className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
        <p>
          <strong>Pix confirmado pela loja.</strong> Obrigado! Seu pedido segue normalmente.
        </p>
      </section>
    );
  }

  return (
    <section className="grid gap-3 rounded-2xl border-2 border-[#128C7E] bg-[#128C7E]/5 p-5 text-center">
      <div className="grid gap-1">
        <h2 className="text-lg font-bold">Falta pagar o Pix</h2>
        <p className="text-sm text-muted-foreground">
          {opening
            ? "Abrindo o WhatsApp da loja..."
            : "Envie o pedido no WhatsApp da loja para receber a chave Pix. Depois é só mandar o comprovante por lá."}
        </p>
      </div>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="inline-flex h-14 items-center justify-center gap-2 rounded-xl bg-[#128C7E] px-4 text-base font-bold text-white shadow-sm hover:opacity-90"
      >
        <MessageCircle className="size-5" /> Pedir a chave Pix no WhatsApp
      </a>
      <p className="text-xs text-muted-foreground">
        A mensagem já vai pronta com o número do pedido, os itens e o total. É só tocar em enviar.
      </p>
    </section>
  );
}
