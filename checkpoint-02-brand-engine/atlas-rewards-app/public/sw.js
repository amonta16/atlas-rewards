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

// CP-211: page + static caching (network-first app pages with an offline
// fallback to the last good copy) lives in sw-offline.js, shared with
// sw-push.js. The old navigate handler here fell back to a cache that was
// never filled and an /offline route that doesn't exist.
importScripts("/sw-offline.js");

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
      data: Object.assign({ url: payload.link_path || payload.url || "/app", slug: payload.slug || null }, payload.data || {}),   // CP-223
      vibrate: [100, 50, 100],
    })
  );
});

// Click → open the customer app
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const d = event.notification.data || {};
  const raw = d.url || "/app";
  const slug = typeof d.slug === "string" && /^[a-z0-9-]+$/.test(d.slug) ? d.slug : null;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    // CP-223: stored links are bare "/app/..."; the push now names its
    // business, so build "/<slug>/app/..." from it (unless this worker runs on
    // that business's own subdomain) instead of borrowing the base of
    // whichever tab is open — that sent a Flippo's tap into another
    // business's app. Older pushes without a slug keep the CP-120.1 guess.
    const isApp = raw === "/app" || raw.indexOf("/app/") === 0 || raw.indexOf("/app?") === 0;
    let target = raw;
    if (isApp) {
      const onSub = slug && self.location.hostname.split(".")[0] === slug;
      if (slug && !onSub) target = "/" + slug + raw;
      else if (!slug) {
        for (const c of all) {
          try {
            const m = new URL(c.url).pathname.match(/^(.*?\/app)(\/|$)/);
            if (m && m[1] !== "/app") { target = m[1] + raw.slice(4); break; }
          } catch (_) { /* ignore */ }
        }
      }
    }
    const base = target.split("?")[0].replace(/\/app\/.*$/, "/app");   // "/<slug>/app"
    // Reuse a window already inside the same app: focus it and move it to the
    // target (no second copy of the app, no cold boot).
    for (const c of all) {
      try {
        const p = new URL(c.url).pathname;
        if ((p === base || p.indexOf(base + "/") === 0) && "focus" in c) {
          const w = await c.focus();
          if ("navigate" in w && new URL(c.url).pathname + new URL(c.url).search !== target) {
            try { await w.navigate(target); } catch (_) { /* uncontrolled window — focus only */ }
          }
          return;
        }
      } catch (_) { /* ignore */ }
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
