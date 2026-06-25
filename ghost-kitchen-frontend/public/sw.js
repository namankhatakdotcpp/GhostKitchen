// Minimal hand-written service worker — no next-pwa or other build-time SW
// generator added for this, since the app had no service worker at all
// before this feature. A static file under /public served as-is by Next.js
// (no special App Router handling needed: it's just a static asset at /sw.js).
//
// Two jobs only: receive a push event and show a notification, and route a
// click on that notification to the relevant page. Does NOT do offline
// caching/asset precaching — that's a separate concern this feature doesn't
// need, and bolting it on here would risk serving stale app shells without
// a real cache-invalidation strategy behind it.

self.addEventListener("push", (event) => {
  let payload = { title: "GhostKitchen", body: "", url: "/" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // Non-JSON payload — fall back to the defaults above rather than throwing.
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: payload.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
