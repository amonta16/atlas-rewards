/**
 * Browser side of push (web push via the venue app's VAPID keys).
 * iPhone: web push only works once the app is added to the Home Screen
 * (iOS 16.4+), so we detect that and explain instead of failing silently.
 *
 * Inside the MedSpa App (Google Play, lib/native.ts) the same three calls use
 * FCM instead: the OS permission dialog, then the device token is saved for
 * the clinic. One token belongs to one clinic at a time (unique user + endpoint),
 * exactly like a browser's web-push endpoint.
 */
import { isNativeApp, nativePlatform, nativePushPermission, nativePushToken } from "./native";

export type PushState = "unsupported" | "needs-install" | "blocked" | "off" | "on";

const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const standalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

const DEMO_KEY = "ms_push_demo_on";
const demoOn = () => { try { return localStorage.getItem(DEMO_KEY) === "1"; } catch { return false; } };
const setDemo = (on: boolean) => { try { if (on) localStorage.setItem(DEMO_KEY, "1"); else localStorage.removeItem(DEMO_KEY); } catch { /* fine */ } };

// The token this app last saved, and for which clinic.
const NATIVE_KEY = "ms_native_push";
type NativeSaved = { token: string; businessId: string };
const nativeSaved = (): NativeSaved | null => { try { return JSON.parse(localStorage.getItem(NATIVE_KEY) ?? "null"); } catch { return null; } };
const setNativeSaved = (v: NativeSaved | null) => { try { if (v) localStorage.setItem(NATIVE_KEY, JSON.stringify(v)); else localStorage.removeItem(NATIVE_KEY); } catch { /* fine */ } };

/** The account is gone, and its token rows with it: forget the copy on this phone. */
export const forgetNativePush = () => setNativeSaved(null);

async function saveNativeToken(token: string, businessId: string): Promise<boolean> {
  const res = await fetch("/api/notifications/subscribe", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ platform: nativePlatform() ?? "android", token, business_id: businessId }),
  }).catch(() => null);
  if (!res?.ok) return false;
  setNativeSaved({ token, businessId });
  return true;
}

// Set when sign-in finishes; the first signed-in clinic screen reads it once (NotifyAfterSignIn).
const SIGNED_IN_KEY = "ms_just_signed_in";
export const markSignedIn = (slug: string) => { try { sessionStorage.setItem(SIGNED_IN_KEY, slug); } catch { /* no prompt, nothing breaks */ } };
export function takeSignedIn(slug: string): boolean {
  try {
    if (sessionStorage.getItem(SIGNED_IN_KEY) !== slug) return false;
    sessionStorage.removeItem(SIGNED_IN_KEY);
    return true;
  } catch { return false; }
}

async function nativeState(businessId: string | undefined, demo: boolean): Promise<PushState> {
  const perm = await nativePushPermission();
  if (!perm) return "unsupported";
  if (perm === "denied") return "blocked";
  if (demo) return perm === "granted" && demoOn() ? "on" : "off";
  const saved = nativeSaved();
  if (perm !== "granted" || !businessId || saved?.businessId !== businessId) return "off";
  // FCM tokens rotate: quietly re-register and re-save if it changed.
  void nativePushToken().then((t) => { if (t && t !== saved.token) void saveNativeToken(t, businessId); });
  return "on";
}

export async function pushState(demo = false, businessId?: string): Promise<PushState> {
  if (typeof window === "undefined") return "unsupported";
  if (isNativeApp()) return nativeState(businessId, demo);
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
  if (isNativeApp()) {
    const token = await nativePushToken();
    if (!token) return (await nativePushPermission()) === "denied" ? "blocked" : "off";
    if (opts.demo) { setDemo(true); return "on"; }
    return (await saveNativeToken(token, businessId)) ? "on" : "off";
  }
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
  if (isNativeApp()) {
    const saved = nativeSaved();
    if (saved) await fetch("/api/notifications/subscribe", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: `fcm-medspa:${saved.token}` }) }).catch(() => {});
    setNativeSaved(null);
    return "off";
  }
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await fetch("/api/notifications/subscribe", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
  return "off";
}
