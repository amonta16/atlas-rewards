// Service worker for the customer PWA.
// MVP scope: offline shell + push notifications (placeholder).

const CACHE = "atlas-rewards-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Network-first for navigation requests, cache fallback for offline
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match(event.request).then((r) => r || caches.match("/offline"))
      )
    );
  }
});

// Push notification handler — fires when a web-push message arrives
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); }
  catch { payload = { title: "Atlas Rewards", body: event.data.text() }; }

  event.waitUntil(
    self.registration.showNotification(payload.title || "Atlas Rewards", {
      body: payload.body || "",
      icon: payload.icon || "/icons/icon-192.png",
      badge: payload.badge || "/icons/badge-72.png",
      data: payload.data || {},
      vibrate: [100, 50, 100],
    })
  );
});

// Click → open the customer app
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/app";
  event.waitUntil(self.clients.openWindow(url));
});
