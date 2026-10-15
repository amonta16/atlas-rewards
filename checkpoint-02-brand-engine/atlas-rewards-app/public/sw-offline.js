/* sw-offline.js — CP-211 · render-from-cache for the customer app
 *
 * Imported by BOTH service workers (sw.js and sw-push.js — whichever one
 * owns the "/" scope on a device), so the behaviour is identical.
 *
 *  · App pages (/…/app…): NETWORK FIRST. A good response is kept as the
 *    device's "last known" copy of that page. Online, customers always get
 *    fresh HTML; offline (or the server unreachable) they get their last
 *    screen instead of the browser's error page, with an offline note.
 *  · /_next/static/*: cache first. These files are content-hashed and
 *    immutable, so the cached copy is always correct and loads instantly.
 *  · Sign-out posts {type:"atlas:clear-pages"} → the page copies are wiped.
 *  · Redirects (e.g. to /login) and errors are never stored.
 */
var PAGE_CACHE = "atlas-pages-v1";
var STATIC_CACHE = "atlas-static-v1";

function isAppPage(req) {
  if (req.method !== "GET" || req.mode !== "navigate") return false;
  try {
    var u = new URL(req.url);
    return u.origin === self.location.origin && /^(\/[^/]+)?\/app(\/|$)/.test(u.pathname);
  } catch (_) { return false; }
}
function isNextStatic(req) {
  if (req.method !== "GET") return false;
  try { var u = new URL(req.url); return u.origin === self.location.origin && u.pathname.indexOf("/_next/static/") === 0; }
  catch (_) { return false; }
}

var OFFLINE_HTML = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>Offline</title><body style="margin:0;font-family:-apple-system,system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;background:#f4f4f5;color:#18181b">' +
  '<div style="text-align:center;padding:24px"><div style="font-size:20px;font-weight:700">You\'re offline</div>' +
  '<p style="color:#52525b;margin-top:6px">Your rewards will load as soon as you\'re back online.</p>' +
  '<button onclick="location.reload()" style="margin-top:14px;padding:10px 18px;border-radius:10px;border:0;background:#18181b;color:#fff;font-weight:600">Try again</button></div>';

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (isAppPage(req)) {
    event.respondWith((async function () {
      var cache = await caches.open(PAGE_CACHE);
      try {
        var res = await fetch(req);
        if (res && res.ok && !res.redirected && res.type === "basic") {
          cache.put(req.url.split("#")[0], res.clone()).catch(function () {});
        }
        return res;
      } catch (_) {
        var hit = await cache.match(req.url.split("#")[0]);
        if (hit) {
          // Mark it so the page can show "offline — showing your last screen".
          var body = await hit.text();
          body = body.replace("<body", '<body data-atlas-offline="1"');
          return new Response(body, { headers: { "content-type": "text/html; charset=utf-8" } });
        }
        return new Response(OFFLINE_HTML, { headers: { "content-type": "text/html; charset=utf-8" } });
      }
    })());
    return;
  }
  if (isNextStatic(req)) {
    event.respondWith((async function () {
      var cache = await caches.open(STATIC_CACHE);
      var hit = await cache.match(req);
      if (hit) return hit;
      var res = await fetch(req);
      if (res && res.ok) cache.put(req, res.clone()).catch(function () {});
      return res;
    })());
  }
});

self.addEventListener("message", function (event) {
  if (event.data && event.data.type === "atlas:clear-pages") {
    event.waitUntil(caches.delete(PAGE_CACHE));
  }
});

self.addEventListener("activate", function (event) {
  // Static files from old deploys are never requested again; drop them so
  // the cache doesn't grow forever (pages are re-validated on every visit).
  event.waitUntil(caches.delete(STATIC_CACHE).then(function () { return caches.open(STATIC_CACHE); }));
});
