/**
 * AI skin scan: the concern catalog, the result shape the app works with, and
 * how a scan's weak spots map onto the clinic's own treatment menu.
 *
 * Safe to import from client components (no server code). The Perfect Corp
 * calls live in perfectcorp.ts.
 */
import type { MedspaTreatment } from "./medspa";

export type ConcernId =
  | "lines" | "texture" | "pores" | "spots" | "redness" | "acne"
  | "dark_circles" | "eye_bags" | "tear_trough" | "firmness" | "hydration" | "radiance";

export type ZoneId = "forehead" | "glabellar" | "crowfeet" | "periocular" | "nasolabial" | "marionette";

/** Perfect Corp skin-simulation parameters (0..1 each). */
export type SimKey = "wrinkle" | "radiance" | "acne" | "eye_bags" | "dark_circle" | "spots" | "pores" | "texture" | "redness";

type ConcernDef = {
  id: ConcernId;
  label: string;
  /** One line under the score: what it means in plain words. */
  what: string;
  hd: string;
  sd: string;
  sim: SimKey | null;
  /** Lower-case keywords matched against a treatment's name, category and description. */
  treats: string[];
};

export const CONCERNS: ConcernDef[] = [
  { id: "lines", label: "Fine lines & wrinkles", what: "Lines on the forehead, between the brows, around the eyes and mouth.", hd: "hd_wrinkle", sd: "wrinkle", sim: "wrinkle",
    treats: ["neurotoxin", "botox", "dysport", "xeomin", "daxxify", "jeuveau", "letybo", "tox", "wrinkle", "microneedl", "resurfac", "morpheus", "co2", "fraxel"] },
  { id: "texture", label: "Texture", what: "How smooth and even the skin surface is.", hd: "hd_texture", sd: "texture", sim: "texture",
    treats: ["microneedl", "peel", "resurfac", "laser", "hydrafacial", "dermaplan", "facial", "prp", "morpheus", "co2", "fraxel", "moxi"] },
  { id: "pores", label: "Pores", what: "How visible pores are on the nose, cheeks and forehead.", hd: "hd_pore", sd: "pore", sim: "pores",
    treats: ["microneedl", "hydrafacial", "peel", "extraction", "facial", "laser", "moxi", "resurfac"] },
  { id: "spots", label: "Sun spots & pigment", what: "Age spots, sun damage and uneven pigment.", hd: "hd_age_spot", sd: "age_spot", sim: "spots",
    treats: ["ipl", "photofacial", "bbl", "peel", "pigment", "bright", "halo", "moxi", "laser"] },
  { id: "redness", label: "Redness", what: "Flushing, visible capillaries and irritation.", hd: "hd_redness", sd: "redness", sim: "redness",
    treats: ["ipl", "photofacial", "bbl", "rosacea", "redness", "vascular", "led", "calm", "laser"] },
  { id: "acne", label: "Breakouts", what: "Active blemishes and congestion.", hd: "hd_acne", sd: "acne", sim: "acne",
    treats: ["acne", "peel", "hydrafacial", "extraction", "blue light", "led", "facial"] },
  { id: "dark_circles", label: "Dark circles", what: "Darkness under the eyes.", hd: "hd_dark_circle", sd: "dark_circle_v2", sim: "dark_circle",
    treats: ["tear trough", "under-eye", "under eye", "polynucleotide", "prp", "filler", "peel"] },
  { id: "eye_bags", label: "Under-eye puffiness", what: "Puffiness and bags below the eyes.", hd: "hd_eye_bag", sd: "eye_bag", sim: "eye_bags",
    treats: ["under-eye", "under eye", "tear trough", "morpheus", "radiofrequency", "rf ", "tighten"] },
  { id: "tear_trough", label: "Under-eye hollows", what: "Hollowness between the lower lid and cheek.", hd: "hd_tear_trough", sd: "tear_trough", sim: null,
    treats: ["tear trough", "under-eye", "under eye", "filler", "polynucleotide"] },
  { id: "firmness", label: "Firmness", what: "How lifted and elastic the skin looks.", hd: "hd_firmness", sd: "firmness", sim: null,
    treats: ["ultherapy", "sofwave", "radiofrequency", "morpheus", "thread", "sculptra", "radiesse", "tighten", "collagen", "filler", "microneedl"] },
  { id: "hydration", label: "Hydration", what: "How plump and moisturized the skin looks.", hd: "hd_moisture", sd: "moisture", sim: null,
    treats: ["hydrafacial", "skinvive", "profhilo", "booster", "hydrat", "facial", "iv "] },
  { id: "radiance", label: "Radiance", what: "Glow and brightness.", hd: "hd_radiance", sd: "radiance", sim: "radiance",
    treats: ["hydrafacial", "peel", "facial", "ipl", "photofacial", "glow", "bright", "dermaplan", "laser"] },
];

export const ZONES: { id: ZoneId; label: string; treats: string[] }[] = [
  { id: "forehead", label: "Forehead", treats: ["neurotoxin", "botox", "dysport", "xeomin", "daxxify", "jeuveau", "tox"] },
  { id: "glabellar", label: "Between the brows", treats: ["neurotoxin", "botox", "dysport", "xeomin", "daxxify", "jeuveau", "tox"] },
  { id: "crowfeet", label: "Crow's feet", treats: ["neurotoxin", "botox", "dysport", "xeomin", "daxxify", "jeuveau", "tox"] },
  { id: "periocular", label: "Around the eyes", treats: ["neurotoxin", "botox", "microneedl", "under-eye", "tox"] },
  { id: "nasolabial", label: "Smile lines", treats: ["filler", "sculptra", "radiesse", "rha", "juvederm", "restylane"] },
  { id: "marionette", label: "Mouth corners", treats: ["filler", "sculptra", "radiesse", "rha", "juvederm", "restylane"] },
];

export const concernDef = (id: ConcernId) => CONCERNS.find((c) => c.id === id)!;

/** The quiz's "what bothers you most" options, each pointing at the concerns it means. */
export const QUIZ_GOALS: { id: string; label: string; concerns: ConcernId[] }[] = [
  { id: "lines", label: "Lines & wrinkles", concerns: ["lines", "firmness"] },
  { id: "texture", label: "Texture & pores", concerns: ["texture", "pores"] },
  { id: "spots", label: "Sun spots & tone", concerns: ["spots", "radiance"] },
  { id: "redness", label: "Redness", concerns: ["redness"] },
  { id: "acne", label: "Breakouts", concerns: ["acne", "pores"] },
  { id: "eyes", label: "Tired eyes", concerns: ["dark_circles", "eye_bags", "tear_trough"] },
  { id: "volume", label: "Lost volume", concerns: ["firmness", "tear_trough"] },
  { id: "glow", label: "Dull skin", concerns: ["radiance", "hydration"] },
];

/** What the scan API hands the browser once both AI tasks finish. */
export type ScanMetric = {
  id: ConcernId;
  score: number;
  /** Mask image(s) that line up with `photoUrl`. */
  masks: string[];
  zones?: { id: ZoneId; score: number; masks: string[] }[];
};

export type ScanResult = {
  /** 0-100, higher is healthier. */
  overall: number;
  skinAge: number | null;
  metrics: ScanMetric[];
  /** The image the masks are aligned to (Perfect Corp's resized copy, or the upload in mock mode). */
  photoUrl: string | null;
  /** The AI "after" preview, or null if the simulation failed. */
  afterUrl: string | null;
  mock: boolean;
};

/** Below this ui_score a concern is worth treating. Perfect Corp's ui_score is calibrated generously, so 75 is a fair line. */
export const WEAK_BELOW = 75;

export function weakest(metrics: ScanMetric[], n = 4): ScanMetric[] {
  return [...metrics].sort((a, b) => a.score - b.score).filter((m) => m.score < WEAK_BELOW).slice(0, n);
}

/** Simulation strengths for the AI preview: stronger for the weaker scores, capped so it stays believable. */
export function simulationFor(metrics: ScanMetric[], goals: ConcernId[]): Partial<Record<SimKey, number>> {
  const out: Partial<Record<SimKey, number>> = {};
  const picked = new Set<ConcernId>([...weakest(metrics, 5).map((m) => m.id), ...goals]);
  for (const id of Array.from(picked)) {
    const def = concernDef(id);
    if (!def.sim) continue;
    const score = metrics.find((m) => m.id === id)?.score ?? 70;
    // 0.6–0.95: Perfect Corp's 1.0 is "most natural, healthy-looking", and below ~0.5 the change is hard to see on a phone.
    out[def.sim] = Math.round(Math.min(0.95, Math.max(0.6, 0.45 + (100 - score) / 60)) * 100) / 100;
  }
  if (Object.keys(out).length === 0) out.radiance = 0.5;
  return out;
}

export type TreatmentMatch = { treatment: MedspaTreatment; concerns: ConcernId[]; zones: ZoneId[] };

const haystack = (t: MedspaTreatment) => ` ${t.name} ${t.category} ${t.description} `.toLowerCase();

/**
 * The clinic's own treatments that target this person's weakest areas, best
 * first. A treatment scores for each weak concern (or wrinkle zone) it names.
 */
export function matchTreatments(treatments: MedspaTreatment[], metrics: ScanMetric[], goals: ConcernId[], max = 3): TreatmentMatch[] {
  const weak = weakest(metrics, 5);
  const focus = Array.from(new Set<ConcernId>([...weak.map((m) => m.id), ...goals]));
  const weakZones = (metrics.find((m) => m.id === "lines")?.zones ?? []).filter((z) => z.score < WEAK_BELOW).map((z) => z.id);
  const rows: (TreatmentMatch & { rank: number })[] = [];
  for (const t of treatments) {
    if (/consult/i.test(t.name)) continue;
    const h = haystack(t);
    const concerns = focus.filter((id) => concernDef(id).treats.some((k) => h.includes(k)));
    const zones = weakZones.filter((z) => ZONES.find((d) => d.id === z)!.treats.some((k) => h.includes(k)));
    if (!concerns.length && !zones.length) continue;
    // Weaker concerns count for more; a stated goal counts a little extra.
    const rank = concerns.reduce((s, id) => s + (100 - (metrics.find((m) => m.id === id)?.score ?? 70)) + (goals.includes(id) ? 10 : 0), 0) + zones.length * 15;
    rows.push({ treatment: t, concerns, zones, rank });
  }
  return rows.sort((a, b) => b.rank - a.rank).slice(0, max).map(({ rank: _r, ...m }) => m);
}

export function scoreWord(score: number): string {
  if (score >= 85) return "Excellent";
  if (score >= 75) return "Good";
  if (score >= 60) return "Fair";
  return "Needs care";
}

/** The demo clinic and instant previews have no database: their saved scans live in this browser, so a sales demo can scan on the phone view and see it on the desk. */
export const demoScansKey = (slug: string) => `atlas-skin-scans:${slug}`;
/** The last scan in this tab, so results survive a refresh and the sign-in round trip. */
export const lastScanKey = (slug: string) => `atlas-skin-scan-last:${slug}`;

export type SavedScan = {
  overall: number; skin_age: number | null; metrics: { id: ConcernId; score: number }[];
  goals: string[]; treatments: string[]; full_name: string | null; phone: string | null; created_at: string;
};
