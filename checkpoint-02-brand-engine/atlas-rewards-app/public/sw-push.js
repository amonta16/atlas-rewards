/* sw-push.js — CP-32
 *
 * Atlas push service worker. Handles 'push' events fired by the
 * browser when our server sends a web-push to a subscribed device,
 * and 'notificationclick' events to focus/open the right tab.
 *
 * Kept deliberately tiny — no caching, no fetch handling. The PWA
 * install/cache logic lives in /sw.js. This worker is scoped at '/'.
 */

self.addEventListener("install",  (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(self.clients.claim()); });

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) { data = {}; }

  const title = data.title || "Atlas";
  const options = {
    body: data.body || "",
    icon: data.icon || "/atlas-engine-logo.png",
    badge: data.badge || "/atlas-engine-logo.png",
    tag: data.tag || ("atlas-" + (data.kind || "notif")),
    data: { url: data.link_path || data.url || "/" },
    requireInteraction: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    // CP-120.1: stored links are bare "/app/..." — correct on subdomain
    // routing, but on the path-routed hosts (www/app.<root>/<slug>/app)
    // they 404. If an open window is on the path form, borrow its
    // "/<slug>/app" base; otherwise keep the raw path (subdomain PWA).
    let target = raw;
    if (raw === "/app" || raw.indexOf("/app/") === 0) {
      for (const c of all) {
        try {
          const pth = new URL(c.url).pathname;
          const m = pth.match(/^(.*?\/app)(\/|$)/);
          if (m && m[1] !== "/app") { target = m[1] + raw.slice(4); break; }
        } catch (_) { /* ignore */ }
      }
    }
    for (const c of all) {
      if (c.url.includes(target) && "focus" in c) return c.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow(target);
  })());
});
