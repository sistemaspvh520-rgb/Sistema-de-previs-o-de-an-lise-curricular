/* Service worker: recebe notificações push (retorno de matrícula) e abre a análise ao clicar. */
self.addEventListener("push", (event) => {
  let data = { title: "Análise Curricular", body: "", url: "/", tag: "follow-up" };
  try { data = { ...data, ...event.data.json() }; } catch { /* payload vazio */ }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/brand/logo-cruzeiro-do-sul-symbol.svg",
      badge: "/brand/logo-cruzeiro-do-sul-symbol.svg",
      tag: data.tag,
      data: { url: data.url },
      requireInteraction: true,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const open = clients.find((c) => c.url.startsWith(self.location.origin));
      if (open) return open.navigate(url).then((c) => c && c.focus());
      return self.clients.openWindow(url);
    }),
  );
});
