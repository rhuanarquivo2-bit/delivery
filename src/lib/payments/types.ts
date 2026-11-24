/** "demo" só existe nas lojas de demonstração (Pix simulado, sem dinheiro de verdade). */
export type PixProvider = "mercadopago" | "asaas" | "demo";

export const PROVIDER_LABELS: Record<PixProvider, string> = {
  mercadopago: "Mercado Pago",
  asaas: "Asaas",
  demo: "Pix de demonstração",
};

export type PixCustomer = { name: string; phone: string; document: string | null };

export type CreatePixInput = {
  orderId: string;
  orderNumber: number;
  storeName: string;
  amountCents: number;
  customer: PixCustomer;
  expiresAt: Date;
  /** URL pública para o aviso de pagamento (só https; em desenvolvimento fica de fora). */
  notificationUrl: string | null;
};

export type PixCharge = {
  externalId: string;
  qrCode: string;
  qrBase64: string | null;
};

export type RemotePayment = {
  status: "paid" | "pending" | "cancelled";
  amountCents: number;
  orderId: string | null;
};

export type AccountInfo = { label: string; liveMode: boolean };

export interface PixGateway {
  /** Confere o token e devolve um nome para mostrar no painel. */
  verifyAccount(token: string): Promise<AccountInfo>;
  createPix(token: string, input: CreatePixInput): Promise<PixCharge>;
  getPayment(token: string, externalId: string): Promise<RemotePayment>;
  cancel(token: string, externalId: string): Promise<void>;
}

/** Erro com mensagem que pode ser mostrada ao operador ou ao cliente. */
export class PaymentError extends Error {}

export const toReais = (cents: number) => Math.round(cents) / 100;
export const toCents = (reais: number) => Math.round(reais * 100);
