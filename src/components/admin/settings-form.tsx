"use client";

import { useActionState } from "react";
import { savePlatformSettings, type AdminResult } from "@/app/admin/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import type { PlatformSettings } from "@/lib/platform";

export function PlatformSettingsForm({ settings }: { settings: PlatformSettings }) {
  const [state, action, pending] = useActionState<AdminResult, FormData>(savePlatformSettings, { ok: true });
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <Field label="Dias de teste para loja nova" htmlFor="trial_days" hint="0 = já começa vencida, até você liberar.">
        <Input id="trial_days" name="trial_days" type="number" min={0} max={365} defaultValue={settings.trial_days} required />
      </Field>
      <Field
        label="Seu WhatsApp de atendimento"
        htmlFor="support_whatsapp"
        hint="Aparece para o lojista quando o acesso vence ou é bloqueado."
      >
        <Input
          id="support_whatsapp"
          name="support_whatsapp"
          inputMode="tel"
          placeholder="(31) 99999-0000"
          defaultValue={settings.support_whatsapp ?? ""}
        />
      </Field>
      <Button disabled={pending} className="sm:mb-6">
        {pending ? "Salvando..." : "Salvar"}
      </Button>
      {state.message ? (
        <Alert tone={state.ok ? "success" : "error"} className="sm:col-span-3">
          {state.message}
        </Alert>
      ) : null}
    </form>
  );
}
