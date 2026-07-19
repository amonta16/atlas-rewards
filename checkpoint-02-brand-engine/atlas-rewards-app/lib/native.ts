/**
 * CP-76: Native bridge — the web app's ONLY window into the Capacitor shell.
 *
 * The mobile app is a Capacitor shell (mobile-shell/ at repo root) whose
 * webview loads the live deployment. Capacitor injects `window.Capacitor`
 * + registered plugins into the page at runtime, so the web bundle needs
 * NO Capacitor npm dependencies — every call here is duck-typed against
 * the injected globals and no-ops gracefully on the regular web/PWA.
 *
 * Why Preferences instead of localStorage for cross-app state: each
 * business lives on its own SUBDOMAIN (different origin → different
 * localStorage). Capacitor Preferences is NATIVE storage reached via the
 * bridge, so the apex /join screen and every business subdomain share it.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

type CapGlobal = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: Record<string, any>;
};

function cap(): CapGlobal | null {
  if (typeof window === "undefined") return null;
  return ((window as any).Capacitor as CapGlobal) ?? null;
}

function plugin(name: string): any | null {
  return cap()?.Plugins?.[name] ?? null;
}

/** True only inside the installed mobile app. */
export function isNative(): boolean {
  return Boolean(cap()?.isNativePlatform?.());
}

export function nativePlatform(): "ios" | "android" | "web" {
  const p = cap()?.getPlatform?.();
  return p === "ios" || p === "android" ? p : "web";
}

/** Android/iOS build number (integer we bump every store release). */
export async function getAppBuild(): Promise<number | null> {
  const app = plugin("App");
  if (!app?.getInfo) return null;
  try {
    const info = await app.getInfo();
    const n = parseInt(String(info?.build ?? ""), 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** Native key-value storage (shared across all origins in the webview). */
export async function prefGet(key: string): Promise<string | null> {
  const p = plugin("Preferences");
  if (!p?.get) return null;
  try {
    const r = await p.get({ key });
    return r?.value ?? null;
  } catch {
    return null;
  }
}

export async function prefSet(key: string, value: string): Promise<void> {
  const p = plugin("Preferences");
  try {
    await p?.set?.({ key, value });
  } catch {
    /* no-op on web */
  }
}

export async function prefRemove(key: string): Promise<void> {
  const p = plugin("Preferences");
  try {
    await p?.remove?.({ key });
  } catch {
    /* no-op on web */
  }
}

/**
 * Native camera QR scan. Returns the raw decoded string, or null if the
 * plugin is unavailable or the user cancelled. hint 0 = QR_CODE.
 */
export async function scanQrCode(): Promise<string | null> {
  const s = plugin("CapacitorBarcodeScanner");
  if (!s?.scanBarcode) return null;
  try {
    const r = await s.scanBarcode({ hint: 0, scanInstructions: "Point your camera at the business QR code" });
    const v = r?.ScanResult ?? null;
    return typeof v === "string" && v.length > 0 ? v : null;
  } catch {
    return null; // cancelled or permission denied
  }
}

/**
 * Play Install Referrer (Android): whatever `?referrer=` carried on the
 * Play Store link — for us, the business join code. Defensive across the
 * plugin names/method shapes in the ecosystem; returns null when absent
 * (e.g. iOS, sideloads, plugin not installed yet).
 */
export async function getInstallReferrer(): Promise<string | null> {
  const p = plugin("InstallReferrer") ?? plugin("CapacitorInstallReferrer");
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
}

/** Deep links (App Links / Universal Links) while the app is running. */
export function onAppUrlOpen(cb: (url: string) => void): void {
  const app = plugin("App");
  try {
    app?.addListener?.("appUrlOpen", (e: any) => {
      if (typeof e?.url === "string") cb(e.url);
    });
  } catch {
    /* no-op */
  }
}

/** Keys shared between /join (apex) and the business subdomains. */
export const PREF_LAST_BUSINESS = "atlas-last-business-slug";
