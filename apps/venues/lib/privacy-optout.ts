/**
 * CP-242: "Do Not Sell or Share" for the marketing site. A visitor is opted
 * out of advertising sharing (the Meta Pixel) when their browser sends Global
 * Privacy Control, or they clicked opt out on /legal/privacy#choices. The
 * cookie is set on the root domain so every atlas-engine.app page agrees.
 */
export const OPTOUT_COOKIE = "atlas_no_share";

export function gpcOn(): boolean {
  return typeof navigator !== "undefined" && (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}

export function optedOut(): boolean {
  if (typeof document === "undefined") return false;
  return gpcOn() || document.cookie.split(/;\s*/).includes(`${OPTOUT_COOKIE}=1`);
}

export function setOptOut(on: boolean) {
  const host = location.hostname;
  const domain = host.endsWith("atlas-engine.app") ? "; domain=.atlas-engine.app" : "";
  document.cookie = on
    ? `${OPTOUT_COOKIE}=1; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax${domain}`
    : `${OPTOUT_COOKIE}=; path=/; max-age=0; samesite=lax${domain}`;
}
