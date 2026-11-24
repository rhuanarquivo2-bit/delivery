import "server-only";
import QRCode from "qrcode";
import type { PixGateway } from "./types";

/**
 * Pix de demonstração: gera um QR Code de mentira (não paga nada de verdade).
 * O "pagamento" é feito pelo botão "Simular pagamento" da página do pedido (demo_pay_pix).
 */
export const demoGateway: PixGateway = {
  async verifyAccount() {
    return { label: "Conta de demonstração", liveMode: false };
  },
  async createPix(_token, input) {
    const code = `DEMONSTRACAO-PEDIDO-${input.orderNumber}-NAO-PAGUE-${input.orderId.slice(0, 8).toUpperCase()}`;
    const dataUrl = await QRCode.toDataURL(code, { margin: 1, width: 240 });
    return { externalId: `demo-${input.orderId}`, qrCode: code, qrBase64: dataUrl.split(",")[1] };
  },
  async getPayment() {
    return { status: "pending", amountCents: 0, orderId: null };
  },
  async cancel() {},
};
