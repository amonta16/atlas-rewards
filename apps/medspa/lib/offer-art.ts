/**
 * CP-262 · Ready-made art for automated offers, one wrapped present per occasion
 * (public/offer-art/<slug>.jpg, 1000×600, drawn by scripts/offer-art). A clinic never
 * has to make or upload a card: the Desk shows this art until they pick their own
 * photo, and saving an offer stores it so the patient app, push and inbox get it too.
 */
const SLUGS = new Set([
  "birthday", "welcome", "anniversary", "comeback", "custom_occasion", "black_friday", "christmas", "easter",
  "fourth_of_july", "halloween", "labor_day", "memorial_day", "new_years", "st_patricks", "valentines", "summer_kickoff",
]);

/** Where the art is served in production. Stored URLs are absolute so push and email can use them. */
export const OFFER_ART_ORIGIN = "https://med.atlas-engine.app";

/** Same-origin path for an offer template's art; unknown occasions get the neutral wrap. */
export function offerArtPath(slug: string | null | undefined) {
  const s = (slug ?? "").toLowerCase().replace(/-/g, "_");
  return `/offer-art/${SLUGS.has(s) ? s : "custom_occasion"}.jpg`;
}

export const offerArtUrl = (slug: string | null | undefined) => `${OFFER_ART_ORIGIN}${offerArtPath(slug)}`;

/**
 * Our own art, from any host (prod, preview deploy, localhost) → its same-origin path, else null.
 * The scratch card paints the art on a canvas it later reads, so it must load from this origin.
 */
export function ownOfferArt(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /^(?:https?:\/\/[^/]+)?(\/offer-art\/[a-z_]+\.jpg)$/.exec(url.split("?")[0]);
  return m ? m[1] : null;
}
