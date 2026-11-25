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
  const title = data.title || "Fomely";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: data.icon || "/api/icone/192",
      badge: "/api/icone/96",
      tag: data.tag,
      renotify: Boolean(data.tag),
      data: { url: data.url || "/" },
      vibrate: [200, 100, 200],
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url === url && "focus" in client) return client.focus();
      }
      for (const client of list) {
        if ("navigate" in client && new URL(client.url).origin === self.location.origin) {
          return client.navigate(url).then((c) => c && c.focus());
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
