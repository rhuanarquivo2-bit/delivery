"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { signIn, signUp, type AuthState } from "./actions";

export function AuthForm({ mode, voltar }: { mode: "entrar" | "cadastro"; voltar?: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    mode === "cadastro" ? signUp : signIn,
    {},
  );
  const isSignUp = mode === "cadastro";

  return (
    <form action={action} className="grid gap-4">
      {voltar ? <input type="hidden" name="voltar" value={voltar} /> : null}
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.info ? <Alert tone="success">{state.info}</Alert> : null}

      <Field label="E-mail" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.email} />
      </Field>
      <Field label="Senha" htmlFor="password" hint={isSignUp ? "Mínimo de 8 caracteres." : undefined}>
        <Input
          id="password"
          name="password"
          type="password"
          minLength={8}
          autoComplete={isSignUp ? "new-password" : "current-password"}
          required
        />
      </Field>

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Aguarde..." : isSignUp ? "Criar conta" : "Entrar"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {isSignUp ? "Já tem conta? " : "Ainda não tem conta? "}
        <Link href={isSignUp ? "/entrar" : "/entrar?modo=cadastro"} className="font-semibold text-brand hover:underline">
          {isSignUp ? "Entrar" : "Criar minha loja"}
        </Link>
      </p>
    </form>
  );
}
