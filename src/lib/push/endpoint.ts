// Só os serviços de notificação dos navegadores (Chrome/Android, Firefox, Safari/iPhone, Edge).
// Evita que alguém cadastre um endereço qualquer para o nosso servidor ficar chamando.
const PUSH_HOSTS = ["googleapis.com", "mozilla.com", "mozaws.net", "push.apple.com", "notify.windows.com"];

export function isPushEndpoint(url: string) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    return u.protocol === "https:" && !u.port && PUSH_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}
