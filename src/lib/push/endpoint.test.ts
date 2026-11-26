import { describe, expect, it } from "vitest";
import { isPushEndpoint } from "./endpoint";

describe("isPushEndpoint", () => {
  it("aceita os serviços de notificação dos navegadores", () => {
    expect(isPushEndpoint("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(isPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc")).toBe(true);
    expect(isPushEndpoint("https://web.push.apple.com/QGx")).toBe(true);
    expect(isPushEndpoint("https://wns2-bl2p.notify.windows.com/w/?token=abc")).toBe(true);
  });

  it("recusa qualquer outro endereço", () => {
    expect(isPushEndpoint("https://exemplo.com/push")).toBe(false);
    expect(isPushEndpoint("https://fcm.googleapis.com.exemplo.com/x")).toBe(false);
    expect(isPushEndpoint("https://evilgoogleapis.com/x")).toBe(false);
    expect(isPushEndpoint("http://fcm.googleapis.com/x")).toBe(false);
    expect(isPushEndpoint("https://fcm.googleapis.com:8443/x")).toBe(false);
    expect(isPushEndpoint("https://169.254.169.254/latest")).toBe(false);
    expect(isPushEndpoint("não é url")).toBe(false);
  });
});
