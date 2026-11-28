"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; info?: string; email?: string };

const credentials = z.object({
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido."),
  password: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres."),
});

function safeRedirectPath(value: FormDataEntryValue | null) {
  const path = typeof value === "string" ? value : "";
  // só caminhos internos conhecidos (nunca outro site)
  return path.startsWith("/painel") || path === "/cozinha" ? path : "/painel";
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (!isSupabaseConfigured) return { error: "O banco de dados ainda não foi configurado." };
  const parsed = credentials.safeParse(Object.fromEntries(formData));
  const email = String(formData.get("email") ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0].message, email };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    const msg =
      error.code === "email_not_confirmed"
        ? "Confirme seu e-mail pelo link que enviamos antes de entrar."
        : "E-mail ou senha incorretos.";
    return { error: msg, email };
  }
  redirect(safeRedirectPath(formData.get("voltar")));
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (!isSupabaseConfigured) return { error: "O banco de dados ainda não foi configurado." };
  const parsed = credentials.safeParse(Object.fromEntries(formData));
  const email = String(formData.get("email") ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0].message, email };

  const h = await headers();
  const origin = h.get("origin") ?? `https://${h.get("host")}`;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: `${origin}/auth/confirmar?proximo=/painel` },
  });
  if (error) {
    console.error("Cadastro falhou:", error.code, error.status, error.message);
    return { error: signUpErrorMessage(error.code), email };
  }
  // Se a confirmação de e-mail estiver desligada no Supabase, a sessão já vem pronta.
  if (data.session) redirect("/painel");
  return { info: `Enviamos um link de confirmação para ${parsed.data.email}. Abra o e-mail para ativar sua conta.` };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/entrar");
}

/** Traduz os erros do Supabase Auth no cadastro para algo que o dono da loja entenda. */
function signUpErrorMessage(code: string | undefined): string {
  switch (code) {
    case "user_already_exists":
    case "email_exists":
      return "Já existe uma conta com esse e-mail. Tente entrar.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.";
    case "email_address_not_authorized":
      return "O envio de e-mails do sistema ainda não está configurado para esse endereço. Fale com o suporte.";
    case "email_address_invalid":
      return "Esse e-mail não parece válido. Confira e tente de novo.";
    case "weak_password":
      return "Senha fraca. Use pelo menos 8 caracteres, misturando letras e números.";
    case "signup_disabled":
      return "Novos cadastros estão desativados no momento.";
    default:
      return "Não foi possível criar a conta agora. Tente de novo em instantes.";
  }
}
