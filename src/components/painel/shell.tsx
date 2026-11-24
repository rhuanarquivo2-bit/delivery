"use client";

import { useState } from "react";
import { LogOut, Menu, X } from "lucide-react";
import { signOut } from "@/app/entrar/actions";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/brand";
import { PainelNav } from "./nav";

export function PainelShell({
  storeName,
  email,
  brandColor,
  topBar,
  children,
}: {
  storeName: string | null;
  email: string;
  brandColor?: string;
  /** Faixa acima do conteúdo (ex.: barra do modo demonstração). */
  topBar?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const sidebar = (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="px-2 pt-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{APP_NAME}</p>
        <p className="truncate text-lg font-bold">{storeName ?? "Nova loja"}</p>
      </div>
      {storeName ? <PainelNav onNavigate={() => setOpen(false)} /> : null}
      <div className="mt-auto grid gap-2 border-t border-border pt-4">
        <p className="truncate px-2 text-xs text-muted-foreground">{email}</p>
        <form action={signOut}>
          <Button variant="ghost" size="sm" className="w-full justify-start">
            <LogOut /> Sair
          </Button>
        </form>
      </div>
    </div>
  );

  return (
    <div
      className="flex min-h-full flex-1"
      style={brandColor ? ({ "--brand": brandColor } as React.CSSProperties) : undefined}
    >
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 border-r border-border bg-card md:block">{sidebar}</aside>

      {open ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button aria-label="Fechar menu" className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-card shadow-xl">{sidebar}</aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        {topBar}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/80 px-4 py-3 backdrop-blur md:hidden">
          <Button variant="ghost" size="icon" aria-label="Abrir menu" onClick={() => setOpen((v) => !v)}>
            {open ? <X /> : <Menu />}
          </Button>
          <span className="truncate font-semibold">{storeName ?? APP_NAME}</span>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 md:px-8 md:py-10">{children}</main>
      </div>
    </div>
  );
}
