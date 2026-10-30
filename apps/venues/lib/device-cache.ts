"use client";
/**
 * lib/device-cache.ts — CP-211 · what the customer app keeps on the phone
 *
 *   atlas-home-<slug> / atlas-home-last (localStorage) — last-known Home
 *     snapshot (first name, points, brand) shown instantly on a cold open
 *     while fresh data streams in. Rewritten on every Home render.
 *   atlas-pages-v1 (Cache Storage, service worker) — last good copy of each
 *     app page, used only when the network is unreachable.
 *
 * clearDeviceCache() wipes both — called on sign-out and account deletion
 * so nothing personal survives on a shared phone.
 */
export type HomeSnapshot = {
  slug: string; business: string; firstName: string; points: number;
  pointsLabel: string; primary: string; secondary: string; savedAt: number;
};

const key = (slug: string) => `atlas-home-${slug}`;

export function saveHomeSnapshot(s: HomeSnapshot) {
  try {
    const v = JSON.stringify(s);
    localStorage.setItem(key(s.slug), v);
    localStorage.setItem("atlas-home-last", v);
  } catch { /* private mode / quota — the app works without it */ }
}

export function readHomeSnapshot(slug: string | null): HomeSnapshot | null {
  try {
    const raw = (slug && localStorage.getItem(key(slug))) || localStorage.getItem("atlas-home-last");
    const s = raw ? (JSON.parse(raw) as HomeSnapshot) : null;
    // Older than 30 days isn't "last known", it's misleading.
    return s && Date.now() - s.savedAt < 30 * 86_400_000 ? s : null;
  } catch { return null; }
}

export async function clearDeviceCache() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith("atlas-home-")).forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
  try { navigator.serviceWorker?.controller?.postMessage({ type: "atlas:clear-pages" }); } catch { /* ignore */ }
  try { await caches?.delete("atlas-pages-v1"); } catch { /* ignore */ }
}
