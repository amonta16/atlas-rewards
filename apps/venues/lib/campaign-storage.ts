/**
 * lib/campaign-storage.ts — CP-135
 *
 * The promo QR carries `?c=<campaign-slug>`. That parameter has to survive
 * landing → signup / login → email confirm → first app load, on the web,
 * the PWA and the native shell. sessionStorage dies across those hops on
 * iOS, so we keep it in localStorage, keyed per business, and the app
 * layout's CampaignResumer picks it up once the customer is signed in.
 */
const KEY = (slug: string) => `atlas_campaign:${slug.toLowerCase()}`;

export function rememberCampaign(businessSlug: string, campaignSlug: string | null | undefined) {
  if (!campaignSlug) return;
  try { localStorage.setItem(KEY(businessSlug), campaignSlug.toLowerCase()); } catch { /* private mode */ }
}
export function readCampaign(businessSlug: string): string | null {
  try { return localStorage.getItem(KEY(businessSlug)); } catch { return null; }
}
export function forgetCampaign(businessSlug: string) {
  try { localStorage.removeItem(KEY(businessSlug)); } catch { /* ignore */ }
}

/** `c` from the current URL, sanitised to a slug. */
export function campaignFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get("c") ?? new URLSearchParams(window.location.search).get("campaign");
  const clean = (v ?? "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return clean.length >= 2 ? clean : null;
}
