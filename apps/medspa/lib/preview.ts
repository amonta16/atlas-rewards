/**
 * lib/preview.ts — CP-232 · instant app previews as clinics.
 *
 * A preview (public.app_previews, built by atlas-engine.app/medspa/app) is
 * shown with the REAL patient app: getClinic("pv-…") turns the row into a
 * Clinic the same way the built-in demo clinic works (id "example", no
 * database writes, checkout/redeem refused). Only the spa's own name, logo,
 * colors, phone and treatments are theirs; photos are our example library.
 *
 * Read through the get_app_preview(slug) RPC only: it returns display columns
 * for ready, unexpired previews and nothing else.
 */
import { cache } from "react";
import { createClient } from "@atlas/core/supabase/server";
import { DEFAULT_MEDSPA_CONFIG, type MedspaConfig, type MedspaTreatment } from "./medspa";
import { buildExampleMedspaConfig, EXAMPLE_IMG, EXAMPLE_REWARDS } from "./example";
import type { MedspaPlan } from "./plans";

export const PREVIEW_SLUG_RE = /^pv-[a-z0-9-]{3,64}$/;

export type PreviewTreatmentRow = { name: string; category: string; price_cents: number | null; member_price_cents: number | null; description?: string | null; image_url?: string | null };
export type PreviewTeamRow = { name: string; title: string; photo_url: string | null };

export type PreviewRow = {
  slug: string; business_name: string; address: string | null; phone: string | null; website: string | null;
  logo_url: string | null; logo_is_monogram: boolean;
  colors: { primary?: string; secondary?: string; accent?: string; onPrimary?: string } | null;
  treatments: PreviewTreatmentRow[] | null; treatments_are_examples: boolean;
  status: string; area_open: boolean | null; expires_at: string;
  // CP-233 (null/[] on previews built before it)
  hero_url?: string | null; font_family?: string | null; about?: string | null; team?: PreviewTeamRow[] | null;
};

/** Only our own storage URLs (https) are used for their photos; anything else falls back. */
export const hostedUrl = (u: unknown): string | null => (typeof u === "string" && /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)\//.test(u) ? u : null);

/** Font family names are checked again before they reach a stylesheet URL or CSS. */
export const safeFont = (f: unknown): string | null => (typeof f === "string" && /^[A-Za-z0-9 ]{2,40}$/.test(f) ? f : null);

export function googleFontHref(font: string): string {
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font).replace(/%20/g, "+")}:wght@400;500;600;700&display=swap`;
}

export type PreviewState = "ready" | "building" | "expired" | "failed" | "missing";

/** "ready" | "building" | "expired" | "missing" for the /p/<slug> page. */
export const getPreviewState = cache(async (slug: string): Promise<PreviewState> => {
  if (!PREVIEW_SLUG_RE.test(slug)) return "missing";
  try {
    const { data, error } = await createClient().rpc("app_preview_state", { p_slug: slug });
    if (error) throw error;
    const s = typeof data === "string" ? data : null;
    return s === "ready" || s === "building" || s === "expired" || s === "failed" ? s : "missing";
  } catch (e) {
    console.error("[preview] state lookup failed", e);
    throw e;
  }
});

export const getPreviewRow = cache(async (slug: string): Promise<PreviewRow | null> => {
  if (!PREVIEW_SLUG_RE.test(slug)) return null;
  const { data, error } = await createClient().rpc("get_app_preview", { p_slug: slug });
  if (error) throw new Error(`preview lookup failed: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as PreviewRow | null;
  return row ?? null;
});

const HEX = /^#[0-9a-f]{6}$/i;

/** Two letters for the monogram ("Glow Aesthetics" → "GA"). Letters and digits only. */
export function initialsOf(name: string): string {
  const words = name.normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w && !/^(the|and|of|med|medical|spa|llc|inc|co)$/i.test(w));
  const s = (words.length >= 2 ? words[0][0] + words[1][0] : (words[0] ?? name).slice(0, 2)).toUpperCase();
  return s.replace(/[^A-Z0-9]/g, "").slice(0, 2) || "A";
}

/** A monogram logo as an SVG data URI. Only [A-Z0-9] and a validated hex color go in. */
export function monogramDataUri(name: string, color: string): string {
  const c = HEX.test(color) ? color : "#4A3F38";
  const letters = initialsOf(name);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="96" viewBox="0 0 240 96"><circle cx="48" cy="48" r="44" fill="${c}"/><text x="48" y="61" text-anchor="middle" font-family="Georgia,serif" font-size="38" font-weight="600" fill="#fff" letter-spacing="1">${letters}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Our example photo that best fits a treatment name/category. */
export function exampleImageFor(name: string, category: string): string {
  const n = name.toLowerCase();
  const t = EXAMPLE_IMG.t;
  if (/botox|dysport|xeomin|daxxify|jeuveau|tox|wrinkle relax/.test(n)) return t("botox");
  if (/filler|juvederm|juvéderm|restylane|rha|lip|cheek|chin|sculptra|radiesse/.test(n)) return t("juvederm");
  if (/hydrafacial|hydra|facial|peel|dermaplan/.test(n)) return t("hydrafacial");
  if (/morpheus|microneedl|rf needl|prp|vampire/.test(n)) return t("morpheus8");
  if (/hair removal|cutera|laser genesis/.test(n)) return t("cutera-xeo");
  if (/coolsculpt|fat|body|contour/.test(n)) return t("coolsculpting");
  if (/emsculpt|muscle/.test(n)) return t("emsculpt-neo");
  if (/sofwave|ultherapy|tighten|thermage/.test(n)) return t("sofwave");
  if (/laser|ipl|bbl|harmony|resurfac|photofacial|pigment|age spot/.test(n)) return t("alma-harmony");
  switch (category) {
    case "Injectables": return t("botox");
    case "Laser": return t("alma-harmony");
    case "Body": return t("coolsculpting");
    case "Wellness": return t("emface");
    default: return t("hydrafacial");
  }
}

const RECALL_WEEKS: Record<string, number | null> = { Injectables: 12, Skin: 4, Laser: 6, Body: 8, Wellness: 4, Consult: null };
const CATS = new Set(["Injectables", "Skin", "Laser", "Body", "Wellness", "Consult"]);

export function previewTreatments(rows: PreviewTreatmentRow[] | null): MedspaTreatment[] {
  return (rows ?? []).slice(0, 12).map((r, i) => {
    const name = String(r.name ?? "").slice(0, 80) || `Treatment ${i + 1}`;
    const category = CATS.has(r.category) ? r.category : "Skin";
    const price = Number.isFinite(r.price_cents) ? Math.round(Number(r.price_cents)) : null;
    const member = Number.isFinite(r.member_price_cents) ? Math.round(Number(r.member_price_cents)) : null;
    return {
      id: `tr_${i}`, name, category, recall_weeks: RECALL_WEEKS[category] ?? null, duration_minutes: category === "Injectables" ? 20 : 45,
      price_cents: price, member_price_cents: member,
      description: typeof r.description === "string" ? r.description.slice(0, 240) : "",
      aftercare: [], image_url: hostedUrl(r.image_url) ?? exampleImageFor(name, category),
      is_active: true, booking_url: null,
    };
  });
}

/** One membership named after the spa: the "membership card" in the preview. */
export function previewPlans(name: string, treatments: MedspaTreatment[]): MedspaPlan[] {
  const first = treatments[0] ?? null;
  return [{
    id: "pl_preview", name: `${name} Membership`.slice(0, 80), tagline: "Member pricing on everything", featured: true,
    description: `Join ${name}'s membership: member pricing on the whole menu, points on every visit and members-only offers.`,
    price_cents: 9900, commitment_months: 0, image_url: first?.image_url ?? EXAMPLE_IMG.hero, is_active: true,
    benefits: ["Member pricing on every treatment", "Points on every visit", "Members-only offers and early booking", "Cancel any month"],
    included: first ? [{ treatment_id: first.id, name: first.name, quantity: 1, unit: "session / month", note: "Example. You set what's included." }] : [],
    join_bonus: "Example membership. You set the price and perks when you go live.",
  }];
}

export function previewConfig(row: PreviewRow): MedspaConfig {
  const base = buildExampleMedspaConfig();
  const treatments = previewTreatments(row.treatments);
  return {
    ...DEFAULT_MEDSPA_CONFIG,
    ...base,
    treatments,
    // CP-233: their own team from their site (no photo → initials), never our example staff
    providers: (row.team ?? []).slice(0, 6).map((m, i) => ({
      id: `pr_${i}`, name: String(m.name ?? "").slice(0, 60), title: String(m.title ?? "").slice(0, 60), bio: "",
      photo_url: hostedUrl(m.photo_url), treatment_ids: [], is_active: true,
    })).filter((p) => p.name.length > 1),
    gallery: [], // not their results
    shop: { ...base.shop, items: base.shop.items.filter((s) => s.kind !== "package").map((s, i) => ({ ...s, id: `sh_${i}`, treatment_id: null })) },
    booking: { ...base.booking, phone: row.phone ?? "" },
    example: true,
  };
}

export { EXAMPLE_REWARDS };
