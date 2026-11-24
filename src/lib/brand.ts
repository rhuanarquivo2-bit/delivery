/** Nome provisório da plataforma. Troque aqui quando a marca for definida. */
export const APP_NAME = "Pedido Fácil";
export const APP_TAGLINE = "Cardápio digital e delivery para pizzarias e hamburguerias";

/**
 * WhatsApp de vendas no formato do wa.me (55 + DDD + número), aceitando o número com ou sem o 55.
 * Vazio: a página de vendas não mostra o botão.
 */
const salesDigits = (process.env.NEXT_PUBLIC_SALES_WHATSAPP ?? "").replace(/\D/g, "");
export const SALES_WHATSAPP =
  salesDigits.length >= 12 && salesDigits.startsWith("55") ? salesDigits : salesDigits ? `55${salesDigits}` : "";
