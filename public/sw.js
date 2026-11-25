// Service worker do Fomely: só cuida das notificações (não guarda páginas em cache).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Fomely", body: event.data ? event.data.text() : "" };
  }
  const actions = Array.isArray(data.actions) ? data.actions.slice(0, 2) : [];
  event.waitUntil(
    self.registration.showNotification(data.title || "Fomely", {
      body: data.body || "",
      icon: data.icon || "/icons/painel-192.png",
      badge: "/icons/badge-96.png",
      tag: data.tag,
      renotify: Boolean(data.tag),
      requireInteraction: Boolean(data.requireInteraction),
      timestamp: Date.now(),
      vibrate: [200, 100, 200, 100, 300],
      // Botões aparecem no Android e no computador; o iPhone mostra só o texto.
      actions: actions.map((a) => ({ action: a.action, title: a.title })),
      data: { url: data.url || "/", actions },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const info = event.notification.data || {};
  const chosen = event.action && (info.actions || []).find((a) => a.action === event.action);
  const url = new URL((chosen && chosen.url) || info.url || "/", self.location.origin);
  // Link de fora (ex.: mapa): abre direto.
  if (url.origin !== self.location.origin) {
    event.waitUntil(self.clients.openWindow(url.href));
    return;
  }
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url === url.href && "focus" in client) return client.focus();
      }
      for (const client of list) {
        if ("navigate" in client && new URL(client.url).origin === self.location.origin) {
          return client.navigate(url.href).then((c) => c && c.focus());
        }
      }
      return self.clients.openWindow(url.href);
    }),
  );
});
