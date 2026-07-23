/**
 * CP-76.3: Native bridge — the web app's ONLY window into the Capacitor shell.
 *
 * REWRITE (was duck-typing `window.Capacitor`): with a remote-URL shell the
 * injected runtime never reaches the page, so `window.Capacitor` was always
 * undefined and the app behaved as plain web. The reliable pattern for
 * remote-loaded apps (Ionic Portals-style) is the reverse: the WEB APP
 * bundles `@capacitor/core` + plugin JS itself. Core detects the native
 * container via the webview's built-in message interface
 * (`window.androidBridge` on Android, `webkit.messageHandlers` on iOS) —
 * which exists on EVERY page the webview loads, any origin — and routes
 * plugin calls over it. On the regular web, `isNativePlatform()` is false
 * and everything here no-ops (Preferences falls back to localStorage).
 *
 * Plugins are dynamically imported inside each helper: SSR-safe, and the
 * regular web bundle only pulls them on native-gated paths.
 *
 * Why Preferences instead of localStorage for cross-app state: each
 * business lives on its own SUBDOMAIN (different origin → different
 * localStorage). Capacitor Preferences is NATIVE storage reached via the
 * bridge, so the apex /join screen and every business subdomain share it.
 */
import { Capacitor } from "@capacitor/core";

/** True only inside the installed mobile app. */
export function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function nativePlatform(): "ios" | "android" | "web" {
  try {
    const p = Capacitor.getPlatform();
    return p === "ios" || p === "android" ? p : "web";
  } catch {
    return "web";
  }
}

/** Android/iOS build number (integer we bump every store release). */
export async function getAppBuild(): Promise<number | null> {
  if (!isNative()) return null;
  try {
    const { App } = await import("@capacitor/app");
    const info = await App.getInfo();
    const n = parseInt(String(info?.build ?? ""), 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** Native key-value storage (shared across all origins in the webview). */
export async function prefGet(key: string): Promise<string | null> {
  try {
    const { Preferences } = await import("@capacitor/preferences");
    const r = await Preferences.get({ key });
    return r?.value ?? null;
  } catch {
    return null;
  }
}

export async function prefSet(key: string, value: string): Promise<void> {
  try {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.set({ key, value });
  } catch {
    /* no-op */
  }
}

export async function prefRemove(key: string): Promise<void> {
  try {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.remove({ key });
  } catch {
    /* no-op */
  }
}

/**
 * Native camera QR scan. Returns the raw decoded string, or null if
 * unavailable or the user cancelled.
 */
export async function scanQrCode(): Promise<string | null> {
  if (!isNative()) return null;
  try {
    const { CapacitorBarcodeScanner, CapacitorBarcodeScannerTypeHint } =
      await import("@capacitor/barcode-scanner");
    const r = await CapacitorBarcodeScanner.scanBarcode({
      hint: CapacitorBarcodeScannerTypeHint.QR_CODE,
      scanInstructions: "Point your camera at the business QR code",
    });
    const v = r?.ScanResult ?? null;
    return typeof v === "string" && v.length > 0 ? v : null;
  } catch {
    return null; // cancelled or permission denied
  }
}

/**
 * Play Install Referrer (Android): whatever `?referrer=` carried on the
 * Play Store link — for us, the business join code. No official plugin;
 * duck-typed against community ones if present in the shell. Null when
 * absent (iOS, sideloads, plugin not installed).
 */
export async function getInstallReferrer(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const plugins = (window as any).Capacitor?.Plugins;
  const p = plugins?.InstallReferrer ?? plugins?.CapacitorInstallReferrer;
  if (!p) return null;
  try {
    const fn = p.getReferrerDetails ?? p.getInstallReferrer ?? null;
    if (!fn) return null;
    const r = await fn.call(p);
    const raw = r?.referrerUrl ?? r?.installReferrer ?? r?.referrer ?? null;
    return typeof raw === "string" && raw.length > 0 ? decodeURIComponent(raw) : null;
  } catch {
    return null;
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

/** Deep links (App Links / Universal Links) while the app is running. */
export function onAppUrlOpen(cb: (url: string) => void): void {
  if (!isNative()) return;
  void (async () => {
    try {
      const { App } = await import("@capacitor/app");
      await App.addListener("appUrlOpen", (e) => {
        if (typeof e?.url === "string") cb(e.url);
      });
    } catch {
      /* no-op */
    }
  })();
}

/**
 * CP-77: Native push registration. Asks for the OS notification
 * permission (Android 13+ shows the system dialog once), registers with
 * FCM, and hands the device token to the callback. Returns false when
 * not native, permission denied, or anything failed — always safe.
 */
export async function registerNativePush(onToken: (token: string) => void): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === "denied") return false; // don't re-nag
    if (perm.receive !== "granted") perm = await PushNotifications.requestPermissions();
    if (perm.receive !== "granted") return false;
    await PushNotifications.addListener("registration", (t) => {
      if (typeof t?.value === "string" && t.value.length > 0) onToken(t.value);
    });
    await PushNotifications.register();
    return true;
  } catch {
    return false;
  }
}

/**
 * CP-80: current OS push-permission state inside the shell.
 * "prompt" = the system dialog hasn't been shown yet (web's "default").
 * Returns "unsupported" on the regular web — callers use the browser
 * Notification API there instead.
 */
export async function checkNativePushPermission(): Promise<"granted" | "denied" | "prompt" | "unsupported"> {
  return (await debugNativePushPermission()).state;
}

/**
 * CP-81.2: same check but keeps the underlying error text, so the
 * Profile diagnostics card can show WHY a build reads as unsupported
 * (e.g. Capacitor's "missing POST_NOTIFICATIONS in AndroidManifest"
 * error from an APK built before the CP-81.1 manifest fix).
 */
export async function debugNativePushPermission(): Promise<{
  state: "granted" | "denied" | "prompt" | "unsupported";
  error: string | null;
}> {
  if (!isNative()) return { state: "unsupported", error: "not native" };
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const perm = await PushNotifications.checkPermissions();
    if (perm.receive === "granted") return { state: "granted", error: null };
    if (perm.receive === "denied") return { state: "denied", error: null };
    return { state: "prompt", error: null };
  } catch (e) {
    return {
      state: "unsupported",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** CP-77: notification tapped (app background/closed) → route to its link. */
export function onPushTap(cb: (linkPath: string) => void): void {
  if (!isNative()) return;
  void (async () => {
    try {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      await PushNotifications.addListener("pushNotificationActionPerformed", (e) => {
        const lp = (e?.notification?.data as Record<string, unknown> | undefined)?.link_path;
        if (typeof lp === "string" && lp.startsWith("/")) cb(lp);
      });
    } catch {
      /* no-op */
    }
  })();
}

/** Keys shared between /join (apex) and the business subdomains. */
export const PREF_LAST_BUSINESS = "atlas-last-business-slug";
