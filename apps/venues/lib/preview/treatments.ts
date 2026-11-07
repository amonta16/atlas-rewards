/**
 * lib/preview/treatments.ts — CP-232/233 · a spa's treatment menu, validated.
 *
 * normalizeTreatments() is the strict, never-throwing check every model answer
 * (or fixture) goes through before it's stored. Nothing here is rendered as HTML.
 * The model call itself lives in extract.ts.
 */
import { z } from "zod";

export const CATEGORIES = ["Injectables", "Skin", "Laser", "Body", "Wellness", "Consult"] as const;
export type Category = (typeof CATEGORIES)[number];

export type PreviewTreatment = {
  name: string; category: Category; price_cents: number | null; member_price_cents: number | null;
  /** CP-233: one or two sentences from their site. */
  description?: string | null;
  /** CP-233: their own photo (source URL while building, re-hosted URL once stored). */
  image_url?: string | null;
};

/** Our own stricter check of whatever came back. */
const Strict = z.object({
  name: z.string().trim().min(2).max(80),
  category: z.enum(CATEGORIES).catch("Skin"),
  price: z.number().finite().min(10).max(25_000).nullable().catch(null),
  description: z.string().nullable().optional().catch(null),
  image: z.number().int().nonnegative().nullable().optional().catch(null),
});

/** Member price shown in the preview: 15% off, rounded to the nearest $5. */
export function memberPriceCents(priceCents: number | null): number | null {
  if (priceCents == null) return null;
  const dollars = Math.round((priceCents / 100) * 0.85 / 5) * 5;
  return dollars >= 5 && dollars * 100 < priceCents ? dollars * 100 : null;
}

export const looksLikeJunk = (n: string) => /https?:|www\.|<|>|\{|\}|ignore|instruction|system prompt/i.test(n);

/** Plain text, at most `max` chars, cut at a sentence or word boundary. */
export function tidyText(raw: unknown, max: number): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (t.length < 3 || looksLikeJunk(t)) return null;
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return stop > max * 0.5 ? cut.slice(0, stop + 1) : `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:\s]+$/, "")}…`;
}

/**
 * Validate, clean and dedupe the model's answer (or a fixture). Never throws.
 * `images` maps the model's image numbers to source URLs (CP-233).
 */
export function normalizeTreatments(raw: unknown, max = 12, images: string[] = []): PreviewTreatment[] {
  const list = (raw && typeof raw === "object" && Array.isArray((raw as { treatments?: unknown }).treatments)
    ? (raw as { treatments: unknown[] }).treatments
    : Array.isArray(raw) ? raw : []) as unknown[];
  const seen = new Set<string>();
  const out: PreviewTreatment[] = [];
  for (const item of list) {
    const p = Strict.safeParse(item);
    if (!p.success) continue;
    const name = p.data.name.replace(/\s+/g, " ");
    if (looksLikeJunk(name)) continue;
    const key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const price_cents = p.data.price == null ? null : Math.round(p.data.price * 100);
    const t: PreviewTreatment = { name, category: p.data.category, price_cents, member_price_cents: memberPriceCents(price_cents) };
    const description = tidyText(p.data.description, 220);
    if (description) t.description = description;
    const img = p.data.image != null ? images[p.data.image] : undefined;
    if (img) t.image_url = img;
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

/** Shown (labeled "example menu") when we can't read the spa's own menu. */
export const EXAMPLE_TREATMENTS: PreviewTreatment[] = [
  { name: "Botox", category: "Injectables", price_cents: 15000, member_price_cents: memberPriceCents(15000) },
  { name: "Dermal filler", category: "Injectables", price_cents: 65000, member_price_cents: memberPriceCents(65000) },
  { name: "HydraFacial", category: "Skin", price_cents: 18000, member_price_cents: memberPriceCents(18000) },
  { name: "Microneedling", category: "Skin", price_cents: 30000, member_price_cents: memberPriceCents(30000) },
  { name: "Chemical peel", category: "Skin", price_cents: 15000, member_price_cents: memberPriceCents(15000) },
  { name: "Laser hair removal", category: "Laser", price_cents: 20000, member_price_cents: memberPriceCents(20000) },
];
