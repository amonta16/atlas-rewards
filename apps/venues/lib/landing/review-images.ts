/**
 * lib/landing/review-images.ts — CP-240 · review screenshots, managed in Admin → Reviews.
 *
 * Upload review images (Google reviews, texts, DMs, emails) once in the admin
 * dashboard. Every review spot on the marketing sites and funnels picks them up:
 * the ocean ReviewsBand (/, /med-spas, /medspa) and the ReviewStrip under the
 * lead magnet (/medspa/app). Each image says which pages it shows on.
 *
 * Storage: public bucket `site-reviews`. Rows: `site_review_images` (RLS on, no
 * policies: only the service role reads/writes, through /api/site-reviews and
 * /api/agency/site-reviews). SQL: db/history/checkpoint-240-review-images.
 */
export const REVIEW_BUCKET = "site-reviews";

/** Where an image can show. Keep in sync with the CHECK in the CP-240 SQL. */
export const REVIEW_PLACEMENTS = [
  { id: "medspa", label: "Med spa pages", hint: "/med-spas, /medspa and the app-preview lead magnet" },
  { id: "general", label: "All-business home", hint: "atlas-engine.app" },
  { id: "venues", label: "Entertainment venues", hint: "/venues" },
] as const;
export type ReviewPlacement = (typeof REVIEW_PLACEMENTS)[number]["id"];
export const isPlacement = (v: unknown): v is ReviewPlacement => REVIEW_PLACEMENTS.some((p) => p.id === v);

/** What the public pages get. */
export type ReviewImage = { id: string; url: string; width: number | null; height: number | null; alt: string };

/** What the admin page gets. */
export type ReviewImageRow = ReviewImage & {
  storage_path: string; show_on: ReviewPlacement[]; active: boolean; sort_order: number; created_at: string;
};

/** Which way the image strip travels. "right" = cards slide left → right. */
export const REVIEW_IMAGE_DIRECTION: "left" | "right" = "right";
