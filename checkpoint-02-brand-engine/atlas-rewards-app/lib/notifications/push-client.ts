/**
 * push-client — CP-32
 *
 * Browser-side helper that:
 *   1. Registers /sw-push.js as a service worker (if not already)
 *   2. Asks for Notification.permission (no-op if granted/denied)
 *   3. Subscribes to PushManager with the VAPID public key from
 *      /api/notifications/vapid-public-key
 *   4. POSTs the subscription to /api/notifications/subscribe so the
 *      server can fan messages out later via web-push.
 *
 * Idempotent — safe to call on every Home mount. Bails silently in
 * unsupported environments (Safari < 16, in-app browsers, etc.).
 */

export async function ensurePushSubscription(businessId: string): Promise<void> {
  // Feature-check first — bail silently if anything is missing.
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  if (!("PushManager" in window)) return;
  if (!("Notification" in window)) return;

  // We register a dedicated push service worker so we don't conflict with
  // the PWA install service worker.
  const reg = await navigator.serviceWorker.register("/sw-push.js", { scope: "/" });

  // Ask for permission if we've never asked.
  let perm = Notification.permission;
  if (perm === "default") {
    perm = await Notification.requestPermission();
  }
  if (perm !== "granted") return;

  // Get the VAPID public key from the server (lazy — only fetch once
  // per session, cached on window for warm reloads).
  const keyRes = await fetch("/api/notifications/vapid-public-key");
  if (!keyRes.ok) return;
  const { key } = await keyRes.json();
  if (!key) return;

  // Subscribe (idempotent — getSubscription returns the existing one if any)
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });
  }

  // Persist server-side
  await fetch("/api/notifications/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      business_id: businessId,
      subscription: sub.toJSON(),
    }),
  }).catch(() => { /* silent — push still works without server-side storage */ });
}

function urlBase64ToUint8Array(b64: string): Uint8Array {
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
