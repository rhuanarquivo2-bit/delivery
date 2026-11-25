import type { Metadata } from "next";
import Link from "next/link";
import { LogOut, ShieldCheck } from "lucide-react";
import { signOut } from "@/app/entrar/actions";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/brand";
import { requirePlatformAdmin } from "@/lib/platform";
import { requireUser } from "@/lib/stores";

export const metadata: Metadata = { title: "Administração", robots: { index: false } };

/** Área só do dono da plataforma: todas as lojas, prazos e bloqueios. */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requireUser();
  await requirePlatformAdmin();
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 md:px-8">
          <ShieldCheck className="size-5 text-brand" />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{APP_NAME}</p>
            <p className="font-bold leading-tight">Administração</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden truncate text-xs text-muted-foreground sm:block">{user.email}</span>
            <Link href="/painel" className="text-sm font-medium text-brand hover:underline">
              Meu painel
            </Link>
            <form action={signOut}>
              <Button variant="ghost" size="sm" aria-label="Sair">
                <LogOut />
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-10">{children}</main>
    </div>
  );
}
