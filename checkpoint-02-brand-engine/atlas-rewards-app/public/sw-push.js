/* sw-push.js — CP-32
 *
 * Atlas push service worker. Handles 'push' events fired by the
 * browser when our server sends a web-push to a subscribed device,
 * and 'notificationclick' events to focus/open the right tab.
 *
 * CP-168: this worker REPLACES /sw.js on any device that turned push on
 * (both register at scope '/'), so the image cache lives here too — see
 * the bottom of the file. Keep the two copies identical.
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

/* CP-168 · image cache — how the big apps feel "instant"
 *
 * McDonald's / Starbucks ship their images once and serve them from the
 * phone afterwards. We do the same for Supabase Storage: every image the
 * app draws (logo, rewards, offers, bookings, wheel prizes) is stored in a
 * Cache Storage bucket the first time it loads; later loads come from disk
 * in ~1 ms and the network copy refreshes quietly in the background
 * (stale-while-revalidate). Only GETs to our storage host are touched, the
 * cache is capped so it never grows past a few hundred entries, and a
 * version bump in IMG_CACHE evicts the old bucket on activate.
 */
const IMG_CACHE = "atlas-img-v1";
const IMG_MAX = 400;

function isStorageImage(req) {
  if (req.method !== "GET") return false;
  try {
    const u = new URL(req.url);
    return /\.supabase\.(co|in)$/.test(u.hostname) && u.pathname.indexOf("/storage/v1/") === 0;
  } catch (_) { return false; }
}

async function trimCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= IMG_MAX) return;
  for (const k of keys.slice(0, keys.length - IMG_MAX)) await cache.delete(k);
}

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n.indexOf("atlas-img-") === 0 && n !== IMG_CACHE).map(n => caches.delete(n)));
  })());
});

self.addEventListener("fetch", (event) => {
  if (!isStorageImage(event.request)) return;
  event.respondWith((async () => {
    const cache = await caches.open(IMG_CACHE);
    const hit = await cache.match(event.request);
    const refresh = fetch(event.request).then((res) => {
      if (res && res.ok) { cache.put(event.request, res.clone()).then(() => trimCache(cache)).catch(() => {}); }
      return res;
    }).catch(() => hit);
    return hit || refresh;
  })());
});
