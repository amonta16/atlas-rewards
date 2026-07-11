/**
 * CP-64 — Shared demo image library (client-safe constants + types).
 *
 * The library lives in the `image-library` storage bucket, cataloged by the
 * `image_library` table (see checkpoint-64-image-library/cp64_image_library.sql)
 * and seeded by scripts/seed-image-library.mjs. Industries here are the
 * *library's* slugs — looser than INDUSTRY_PRESETS on purpose, since the
 * library also covers niches we pitch that have no template yet
 * (smoke shops, dispensaries, …).
 */

export type LibraryCategory = "hero" | "reward" | "offer";

export type LibraryImage = {
  id: string;
  industry: string;
  category: LibraryCategory;
  title: string;
  tags: string[];
  storage_path: string;
  public_url: string;
  credit: string | null;
  source_url: string | null;
  width: number | null;
  height: number | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
};

export const LIBRARY_CATEGORIES: { value: LibraryCategory; label: string }[] = [
  { value: "hero", label: "Hero" },
  { value: "reward", label: "Rewards" },
  { value: "offer", label: "Offers" },
];

/** Pretty labels for known library industries. Unknown slugs (added later via
 *  the manifest) still render — they just get a title-cased fallback label. */
export const LIBRARY_INDUSTRY_LABELS: Record<string, string> = {
  "medspa": "Medspa",
  "beauty-salon": "Beauty Salon",
  "smoke-shop": "Smoke Shop",
  "dispensary": "Dispensary",
  "coffee-shop": "Coffee Shop",
  "arcade": "Arcade",
  "ice-cream": "Ice Cream",
  "restaurant": "Restaurant",
};

export function libraryIndustryLabel(slug: string): string {
  return (
    LIBRARY_INDUSTRY_LABELS[slug] ??
    slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

/** Maps a business's `industry` (INDUSTRY_PRESETS / INDUSTRY_TEMPLATES value)
 *  to the library slug so the picker opens pre-filtered to the right niche. */
export const BUSINESS_INDUSTRY_TO_LIBRARY: Record<string, string> = {
  medspa: "medspa",
  salon: "beauty-salon",
  restaurant: "restaurant",
  arcade: "arcade",
  coffee: "coffee-shop",
  yogurt: "ice-cream",
};

export function libraryIndustryForBusiness(
  businessIndustry: string | null | undefined
): string | null {
  if (!businessIndustry) return null;
  return BUSINESS_INDUSTRY_TO_LIBRARY[businessIndustry] ?? null;
}
