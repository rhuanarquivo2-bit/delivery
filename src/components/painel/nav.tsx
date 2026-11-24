"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bike,
  ClipboardList,
  Home,
  LayoutGrid,
  Store,
  Ticket,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: LucideIcon; soon?: boolean };

const ITEMS: Item[] = [
  { href: "/painel", label: "Início", icon: Home },
  { href: "/painel/pedidos", label: "Pedidos", icon: ClipboardList },
  { href: "/painel/cardapio", label: "Cardápio", icon: LayoutGrid },
  { href: "/painel/cupons", label: "Cupons", icon: Ticket, soon: true },
  { href: "/painel/financeiro", label: "Financeiro", icon: Wallet, soon: true },
  { href: "/painel/motoboys", label: "Motoboys", icon: Bike, soon: true },
  { href: "/painel/loja", label: "Minha loja", icon: Store },
];

export function PainelNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="grid gap-1">
      {ITEMS.map(({ href, label, icon: Icon, soon }) => {
        const active = href === "/painel" ? pathname === href : pathname.startsWith(href);
        if (soon) {
          return (
            <span
              key={href}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground/60"
              title="Disponível nas próximas fases"
            >
              <Icon className="size-4" />
              {label}
              <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                em breve
              </span>
            </span>
          );
        }
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              active ? "bg-brand/10 text-brand" : "text-foreground/80 hover:bg-muted",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
