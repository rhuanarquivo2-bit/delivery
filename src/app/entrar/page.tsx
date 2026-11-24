import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_NAME } from "@/lib/brand";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { AuthForm } from "./auth-form";

export const metadata = { title: "Entrar" };

export default async function EntrarPage({ searchParams }: PageProps<"/entrar">) {
  const params = await searchParams;
  const mode = params.modo === "cadastro" ? "cadastro" : "entrar";
  const voltar = typeof params.voltar === "string" ? params.voltar : undefined;

  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    if (data?.claims) redirect("/painel");
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 block text-center text-lg font-bold tracking-tight">
          <span className="text-brand">●</span> {APP_NAME}
        </Link>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{mode === "cadastro" ? "Crie sua conta" : "Acesse seu painel"}</CardTitle>
            <CardDescription>
              {mode === "cadastro"
                ? "Em seguida você cadastra sua loja em poucos minutos."
                : "Entre com o e-mail e a senha da sua loja."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {!isSupabaseConfigured ? (
              <Alert>
                O banco de dados ainda não está conectado. Siga o passo a passo em{" "}
                <code className="font-mono text-xs">docs/configurar-supabase.md</code>.
              </Alert>
            ) : null}
            <AuthForm key={mode} mode={mode} voltar={voltar} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
