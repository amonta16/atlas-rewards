/* Med spa app push worker.
 * Pushes are sent by the venue app's engine with venue-style links
 * ("/app/book") plus the clinic slug. On this origin "/<slug>/app/..." is
 * translated to the right med spa screen by app/[clinic]/app/[[...rest]].
 */
self.addEventListener("install", () => { self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(self.clients.claim()); });

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) { data = {}; }
  event.waitUntil(self.registration.showNotification(data.title || "Your clinic", {
    body: data.body || "",
    icon: data.icon || "/atlas-icon-512.png",
    badge: "/icons/icon-192.png",
    tag: data.tag || ("ms-" + (data.kind || "notif")),
    data: { url: data.link_path || data.url || "/", slug: data.slug || null },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const d = event.notification.data || {};
  const raw = typeof d.url === "string" ? d.url : "/";
  const slug = typeof d.slug === "string" && /^[a-z0-9-]+$/.test(d.slug) ? d.slug : null;
  let target = raw;
  if (raw === "/app" || raw.indexOf("/app/") === 0 || raw.indexOf("/app?") === 0) target = slug ? "/" + slug + raw : "/";
  else if (raw.charAt(0) !== "/") target = "/";
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if ("focus" in c) { await c.focus(); if ("navigate" in c) { try { await c.navigate(target); } catch (_) {} } return; }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});
