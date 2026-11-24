/** Nome da plataforma. */
export const APP_NAME = "Fomely";
export const APP_TAGLINE = "Cardápio digital e delivery para pizzarias e hamburguerias";

/**
 * WhatsApp de vendas no formato do wa.me (55 + DDD + número), aceitando o número com ou sem o 55.
 * Padrão: o WhatsApp de vendas atual. Dá para trocar com NEXT_PUBLIC_SALES_WHATSAPP.
 */
const salesDigits = (process.env.NEXT_PUBLIC_SALES_WHATSAPP || "31982346027").replace(/\D/g, "");
export const SALES_WHATSAPP =
  salesDigits.length >= 12 && salesDigits.startsWith("55") ? salesDigits : salesDigits ? `55${salesDigits}` : "";

/** Preço do plano mostrado na página de vendas. */
export const PLAN_PRICE = "R$ 99,90";
