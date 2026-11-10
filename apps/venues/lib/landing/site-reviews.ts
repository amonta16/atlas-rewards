/**
 * lib/landing/site-reviews.ts — CP-188 · the moving review cards on atlas-engine.app
 *
 * RULE (Atlas Messaging Library): no invented reviews. A card renders only
 * when it carries a real quote. While SHOW_REVIEW_SLOTS is true, empty slots
 * render as clearly-labeled "review slot" cards so the band has shape during
 * setup; flip it to false before ads so only real reviews show (the band
 * hides itself if none are real).
 *
 * To add a real review: quote (their words), name, role, business, city,
 * optional rating 1–5 (only if they gave one — Google review, text, email).
 *
 * CP-239 · partner reviews. Reviews from clients of our co-founder's practice-app
 * service (run before he joined Atlas) carry `via: "partner"`. They show with an
 * attribution line (REVIEW_PARTNER) and never under an "about Atlas" heading, because
 * those clients reviewed his service, not Atlas. Their words, verbatim, with their OK:
 * paste exactly what the client wrote (Google, text, email), no edits beyond trimming,
 * and keep `sourceNote` so we can show where it came from if asked (FTC 16 CFR 465).
 * `topics` lets the single-quote callouts pick the review that backs up a section.
 */
export type ReviewTopic = "recall" | "setup" | "pricing" | "membership" | "rewards" | "desk" | "service" | "brand";

export type SiteReview = {
  id: string; quote: string | null; name: string; role: string; business: string; city: string;
  rating: number | null; source: "google" | "text" | "video" | "email" | null;
  /** Optional short headline the client wrote (e.g. a Google review's first line). */
  title?: string | null;
  /** "partner" = a client of the co-founder's service before Atlas. Default: an Atlas client. */
  via?: "atlas" | "partner";
  /** Where the original is (e.g. "Google review, Oct 2025", "text to Jordan, saved"). Not shown. */
  sourceNote?: string | null;
  topics?: ReviewTopic[];
  /** Pin to the front of carousels. */
  featured?: boolean;
};

export const SHOW_REVIEW_SLOTS = true;

/** Who the partner reviews are about. Fill in `name` before adding partner reviews; until then they stay hidden. */
export const REVIEW_PARTNER = {
  name: "Adrian" as string | null,
  /** Shown above or under partner reviews. */
  line: (name: string) => `From practices ${name} set up and supports. ${name} now leads client success at Atlas.`,
};

export const SITE_REVIEWS: SiteReview[] = [
  { id: "slot-1", quote: null, name: "Owner", role: "Med spa owner", business: "Your practice", city: "California", rating: null, source: null },
  { id: "slot-2", quote: null, name: "Lead injector", role: "Nurse injector", business: "Your practice", city: "California", rating: null, source: null },
  { id: "slot-3", quote: null, name: "Front desk", role: "Front desk lead", business: "Your practice", city: "California", rating: null, source: null },
  { id: "slot-4", quote: null, name: "Owner", role: "Aesthetics clinic owner", business: "Your practice", city: "California", rating: null, source: null },
];

/** Real reviews only: a quote, and for partner reviews, a named partner to attribute them to. Featured first. */
export function realReviews(): SiteReview[] {
  return SITE_REVIEWS
    .filter((r) => r.quote && (r.via !== "partner" || REVIEW_PARTNER.name))
    .sort((a, b) => Number(!!b.featured) - Number(!!a.featured));
}

/** The best real review for a topic, or null. `skip` avoids repeating one already on the page. */
export function reviewFor(topic: ReviewTopic, skip: string[] = []): SiteReview | null {
  return realReviews().find((r) => r.topics?.includes(topic) && !skip.includes(r.id)) ?? null;
}

export function partnerLine(): string | null {
  return REVIEW_PARTNER.name ? REVIEW_PARTNER.line(REVIEW_PARTNER.name) : null;
}

export const SITE_BADGES: { t: string; d: string }[] = [
  { t: "Live at a real counter since 2025", d: "Flippo's Arcade & Batting Cage, Morro Bay" },
  { t: "Month to month", d: "No long contract, no 90-day notice" },
  { t: "Built in California", d: "Set up with you, in person or on a call" },
];
