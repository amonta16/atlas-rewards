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
 */
export type SiteReview = { id: string; quote: string | null; name: string; role: string; business: string; city: string; rating: number | null; source: "google" | "text" | "video" | "email" | null };

export const SHOW_REVIEW_SLOTS = true;

export const SITE_REVIEWS: SiteReview[] = [
  { id: "slot-1", quote: null, name: "Owner", role: "Med spa owner", business: "Your practice", city: "California", rating: null, source: null },
  { id: "slot-2", quote: null, name: "Lead injector", role: "Nurse injector", business: "Your practice", city: "California", rating: null, source: null },
  { id: "slot-3", quote: null, name: "Front desk", role: "Front desk lead", business: "Your practice", city: "California", rating: null, source: null },
  { id: "slot-4", quote: null, name: "Owner", role: "Aesthetics clinic owner", business: "Your practice", city: "California", rating: null, source: null },
];

export const SITE_BADGES: { t: string; d: string }[] = [
  { t: "Live at a real counter since 2025", d: "Flippo's Arcade & Batting Cage, Morro Bay" },
  { t: "Month to month", d: "No long contract, no 90-day notice" },
  { t: "Built in California", d: "Set up with you, in person or on a call" },
];
