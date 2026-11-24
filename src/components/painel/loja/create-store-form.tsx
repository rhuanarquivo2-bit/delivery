"use client";

import { useActionState, useState } from "react";
import { createStore, type FormState } from "@/app/painel/loja/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { slugify } from "@/lib/utils";
import { keepValuesOnSubmit } from "@/lib/use-keep-values-submit";
import { ColorPicker } from "./color-picker";

export function CreateStoreForm({ rootDomain }: { rootDomain: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createStore, {});
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const effectiveSlug = slugTouched ? slug : slugify(name);

  return (
    <form onSubmit={keepValuesOnSubmit(action)} className="grid gap-5">
      {state.message && !state.errors ? <Alert tone="error">{state.message}</Alert> : null}
      <Field label="Nome da loja" htmlFor="name" error={state.errors?.name}>
        <Input
          id="name"
          name="name"
          required
          placeholder="Ex.: Pizzaria do João"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field
        label="Endereço do seu site"
        htmlFor="slug"
        error={state.errors?.slug}
        hint="Letras minúsculas, números e hífen. Dá para mudar depois."
      >
        <div className="flex items-center overflow-hidden rounded-xl border border-border bg-background focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/25">
          <Input
            id="slug"
            name="slug"
            required
            className="rounded-none border-0 shadow-none focus-visible:ring-0"
            value={effectiveSlug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value.toLowerCase());
            }}
          />
          <span className="shrink-0 bg-muted px-3 py-3 text-sm text-muted-foreground">.{rootDomain}</span>
        </div>
      </Field>
      <Field label="WhatsApp da loja" htmlFor="whatsapp" error={state.errors?.whatsapp} hint="Com DDD.">
        <Input id="whatsapp" name="whatsapp" inputMode="tel" placeholder="(11) 99999-9999" />
      </Field>
      <Field label="Cor principal" error={state.errors?.primary_color}>
        <ColorPicker name="primary_color" defaultValue="#E4572E" />
      </Field>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Criando..." : "Criar minha loja"}
      </Button>
    </form>
  );
}
