"use client";

import { startTransition } from "react";

/**
 * Por padrão o React limpa o formulário depois de uma Server Action.
 * Use em formulários longos para que o que foi digitado continue lá quando houver erro.
 */
export function keepValuesOnSubmit(action: (formData: FormData) => void) {
  return (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => action(formData));
  };
}
