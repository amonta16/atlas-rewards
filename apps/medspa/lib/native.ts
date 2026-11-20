/**
 * Bridge to the MedSpa App on Google Play (native/medspa-shell, Capacitor 8).
 *
 * The shell loads this live site in a webview. `@capacitor/core` is bundled
 * here and detects the shell through the webview's own bridge
 * (window.androidBridge), so on the plain web everything below is a no-op.
 * Plugins are imported dynamically: SSR-safe, and the web bundle only pulls
 * them on native paths.
 *
 * Push inside the app is FCM, not web push (Android webviews have no
 * PushManager). The token is saved in push_subscriptions as
 * "fcm-medspa:<token>" and delivered by app/api/push/deliver through the
 * MedSpa App's own Firebase project.
 */
import { Capacitor } from "@capacitor/core";

export function isNativeApp(): boolean {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
}

export function nativePlatform(): "android" | "ios" | null {
  try {
    const p = Capacitor.getPlatform();
    return p === "android" || p === "ios" ? p : null;
  } catch { return null; }
}

/** A bridge call on a weak connection can hang on its chunk download: give up after a few seconds. */
function bounded<T>(work: Promise<T>, fallback: T, ms = 8000): Promise<T> {
  return new Promise<T>((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    work.then((v) => { clearTimeout(t); resolve(v); }, () => { clearTimeout(t); resolve(fallback); });
  });
}

export type NativePerm = "granted" | "denied" | "prompt";

export async function nativePushPermission(): Promise<NativePerm | null> {
  if (!isNativeApp()) return null;
  return bounded((async () => {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const p = await PushNotifications.checkPermissions();
    return p.receive === "granted" ? "granted" : p.receive === "denied" ? "denied" : "prompt";
  })(), null);
}

/**
 * Ask for the Android notification permission (13+ shows the system dialog
 * once), register with FCM and resolve with the device token.
 * Resolves null when denied, cancelled or anything failed.
 */
export async function nativePushToken(): Promise<string | null> {
  if (!isNativeApp()) return null;
  return bounded((async () => {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive !== "granted") perm = await PushNotifications.requestPermissions();
    if (perm.receive !== "granted") return null;
    return await new Promise<string | null>((resolve) => {
      let done = false;
      const finish = (v: string | null, handles: { remove: () => Promise<void> }[]) => {
        if (done) return; done = true;
        handles.forEach((h) => { h.remove().catch(() => {}); });
        resolve(v);
      };
      const handles: { remove: () => Promise<void> }[] = [];
      void (async () => {
        handles.push(await PushNotifications.addListener("registration", (t) => finish(t?.value || null, handles)));
        handles.push(await PushNotifications.addListener("registrationError", () => finish(null, handles)));
        await PushNotifications.register();
      })().catch(() => finish(null, handles));
    });
  })(), null, 20000);
}

/**
 * Where a push should take the patient. The venue engine sends venue-style
 * links ("/app/rewards") plus the clinic slug; app/[clinic]/app/[[...rest]]
 * maps "/<slug>/app/..." onto the right med spa screen (same rule as
 * public/sw-push.js).
 */
export function pushTarget(linkPath: unknown, slug: unknown): string {
  const raw = typeof linkPath === "string" ? linkPath : "/";
  const s = typeof slug === "string" && /^[a-z0-9-]+$/.test(slug) ? slug : null;
  if (raw === "/app" || raw.startsWith("/app/") || raw.startsWith("/app?")) return s ? `/${s}${raw}` : "/";
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return s ? `/${s}` : "/";
}

let tapListening = false;
/** Notification tapped while the app was in the background or closed → open its screen. */
export function listenForPushTaps(go: (path: string) => void): void {
  if (!isNativeApp() || tapListening) return;
  tapListening = true;
  void (async () => {
    try {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      await PushNotifications.addListener("pushNotificationActionPerformed", (e) => {
        const d = (e?.notification?.data as Record<string, unknown> | undefined) ?? {};
        go(pushTarget(d.link_path, d.slug));
      });
    } catch {
      tapListening = false;
    }
  })();
}
