// Service worker for the customer PWA.
// MVP scope: offline shell + push notifications (placeholder).
// CP-168: + stale-while-revalidate image cache (bottom of file).

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
