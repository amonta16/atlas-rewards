/**
 * CP-242: privacy choices for the marketing site (atlas-engine.app).
 *
 * Non-essential tracking there = the first-party visit counter (VisitBeacon)
 * and the Meta Pixel. It runs only when trackingAllowed():
 *   - never with Global Privacy Control, or after "Do Not Sell or Share"
 *     (atlas_no_share=1), or after "Decline" on the cookie banner;
 *   - EU / UK / EEA / Swiss visitors (atlas_geo=strict, set by middleware from
 *     Vercel's country header): only after "Accept" (opt-in);
 *   - everyone else: unless they declined (notice + opt-out, US model).
 * Customer and patient apps never load these, so they need no banner.
 */
export const OPTOUT_COOKIE = "atlas_no_share";
export const CONSENT_COOKIE = "atlas_consent"; // "all" | "essential"
export const GEO_COOKIE = "atlas_geo"; // "strict" | "notice" (middleware)
export const CONSENT_EVENT = "atlas-consent";

export function gpcOn(): boolean {
  return typeof navigator !== "undefined" && (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}

function cookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const hit = document.cookie.split(/;\s*/).find((c) => c.startsWith(`${name}=`));
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : null;
}

function write(name: string, value: string | null) {
  const domain = location.hostname.endsWith("atlas-engine.app") ? "; domain=.atlas-engine.app" : "";
  document.cookie = value === null
    ? `${name}=; path=/; max-age=0; samesite=lax${domain}`
    : `${name}=${encodeURIComponent(value)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax${domain}`;
}

export const strictRegion = () => cookie(GEO_COOKIE) === "strict";
export const consentChoice = () => cookie(CONSENT_COOKIE) as "all" | "essential" | null;

/** "Do Not Sell or Share" is on (explicitly, by GPC, or by declining cookies). */
export function optedOut(): boolean {
  return gpcOn() || cookie(OPTOUT_COOKIE) === "1" || consentChoice() === "essential";
}

/** May the visit counter and the Meta Pixel run? */
export function trackingAllowed(): boolean {
  if (optedOut()) return false;
  if (consentChoice() === "all") return true;
  return !strictRegion();
}

/** Has the visitor already decided (or does GPC decide for them)? */
export const consentDecided = () => gpcOn() || consentChoice() !== null || cookie(OPTOUT_COOKIE) === "1";

function announce() { window.dispatchEvent(new Event(CONSENT_EVENT)); }

export function setOptOut(on: boolean) {
  write(OPTOUT_COOKIE, on ? "1" : null);
  write(CONSENT_COOKIE, on ? "essential" : "all");
  announce();
}

export function setConsent(choice: "all" | "essential") {
  write(CONSENT_COOKIE, choice);
  write(OPTOUT_COOKIE, choice === "essential" ? "1" : null);
  announce();
}
