/**
 * Browser side of push (web push via the venue app's VAPID keys).
 * iPhone: web push only works once the app is added to the Home Screen
 * (iOS 16.4+), so we detect that and explain instead of failing silently.
 */
export type PushState = "unsupported" | "needs-install" | "blocked" | "off" | "on";

const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const standalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

const DEMO_KEY = "ms_push_demo_on";
const demoOn = () => { try { return localStorage.getItem(DEMO_KEY) === "1"; } catch { return false; } };
const setDemo = (on: boolean) => { try { if (on) localStorage.setItem(DEMO_KEY, "1"); else localStorage.removeItem(DEMO_KEY); } catch { /* fine */ } };

export async function pushState(demo = false): Promise<PushState> {
  if (typeof window === "undefined") return "unsupported";
  const w = window as unknown as { PushManager?: unknown; Notification?: unknown };
  const supported = "serviceWorker" in navigator && !!w.PushManager && !!w.Notification;
  if (!supported) return isIOS() && !standalone() ? "needs-install" : "unsupported";
  if (Notification.permission === "denied") return "blocked";
  if (demo) return Notification.permission === "granted" && demoOn() ? "on" : "off";
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

function keyBytes(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Ask permission, subscribe and save it for this clinic. `demo` shows a local test notification instead of saving. */
export async function turnOnPush(businessId: string, opts: { demo?: boolean; clinicName?: string } = {}): Promise<PushState> {
  const reg = await navigator.serviceWorker.register("/sw-push.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  const perm = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (perm !== "granted") return perm === "denied" ? "blocked" : "off";

  if (opts.demo) {
    setDemo(true);
    await reg.showNotification(opts.clinicName ?? "Your clinic", { body: "You're all set. We'll let you know about rewards, offers and your next visit.", icon: "/atlas-icon-512.png" });
    return "on";
  }
  const { key } = (await fetch("/api/notifications/vapid-public-key").then((r) => r.json()).catch(() => ({}))) as { key?: string };
  if (!key) return "off";
  const sub = (await reg.pushManager.getSubscription())
    ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) as unknown as BufferSource }));
  const res = await fetch("/api/notifications/subscribe", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ business_id: businessId, subscription: sub.toJSON() }),
  });
  return res.ok ? "on" : "off";
}

export async function turnOffPush(): Promise<PushState> {
  setDemo(false);
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await fetch("/api/notifications/subscribe", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
  return "off";
}
