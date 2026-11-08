/**
 * lib/preview/quiz.ts — CP-234 · the questions after the contact form, in one place.
 *
 * Client-safe (no secrets): the funnel renders these and the server validates
 * answers against the same ids. Wording is ours (Atlas), written for owners.
 */

/** Booking software, with each company's own app icon (public/booking-logos, taken from their sites). */
export const BOOKING_TOOLS: ReadonlyArray<{ name: string; logo: string }> = [
  { name: "Boulevard", logo: "boulevard" }, { name: "Vagaro", logo: "vagaro" }, { name: "Mangomint", logo: "mangomint" },
  { name: "Zenoti", logo: "zenoti" }, { name: "Mindbody", logo: "mindbody" }, { name: "GlossGenius", logo: "glossgenius" },
  { name: "Square", logo: "square" }, { name: "Fresha", logo: "fresha" }, { name: "PatientNow", logo: "patientnow" },
  { name: "AestheticsPro", logo: "aestheticspro" }, { name: "Pabau", logo: "pabau" }, { name: "Aesthetic Record", logo: "aestheticrecord" },
  { name: "Jane", logo: "jane" },
];

export type OfferGroup = { id: string; label: string; items: Array<{ id: string; label: string; hint?: string; match: RegExp }> };

/** "What do you offer?" — grouped; `match` pre-ticks items from the treatments we found on their site. */
export const OFFER_GROUPS: OfferGroup[] = [
  {
    id: "injectables", label: "Injectables", items: [
      { id: "neurotoxin", label: "Botox & other neurotoxins", hint: "Botox, Dysport, Xeomin, Daxxify, Jeuveau", match: /botox|dysport|xeomin|daxxify|jeuveau|neurotox|neuromod|tox\b|wrinkle relax/i },
      { id: "filler", label: "Dermal fillers", hint: "Juvéderm, Restylane, RHA, lips, cheeks", match: /filler|juv[eé]derm|restylane|rha\b|lip\b|lips|cheek|chin/i },
      { id: "biostim", label: "Collagen stimulators", hint: "Sculptra, Radiesse", match: /sculptra|radiesse|biostim/i },
      { id: "kybella", label: "Fat-dissolving injections", hint: "Kybella", match: /kybella|deoxychol|fat.?dissolv/i },
      { id: "prp", label: "PRP / PRF", hint: "Platelet-rich plasma", match: /\bprp\b|\bprf\b|platelet|vampire/i },
    ],
  },
  {
    id: "devices", label: "Lasers & devices", items: [
      { id: "laser", label: "Laser resurfacing", hint: "CO2, fractional, Halo, Moxi", match: /laser (skin|resurf)|resurfac|co2|fraxel|halo|moxi|clearlift|laser rejuv|refresh/i },
      { id: "ipl", label: "IPL / photofacial", hint: "BBL, pigment, redness", match: /\bipl\b|\bbbl\b|photofacial|pigment|redness|capillar|vascular/i },
      { id: "lhr", label: "Laser hair removal", match: /hair removal/i },
      { id: "rfmn", label: "RF microneedling", hint: "Morpheus8, Vivace, Potenza", match: /morpheus|vivace|potenza|rf micro|radiofrequency/i },
      { id: "tighten", label: "Skin tightening", hint: "Ultherapy, Sofwave, Thermage", match: /ultherapy|sofwave|thermage|tighten/i },
      { id: "body", label: "Body contouring", hint: "CoolSculpting, Emsculpt", match: /coolsculpt|emsculpt|body contour|cryolipo|sculpt/i },
      { id: "tattoo", label: "Tattoo removal", match: /tattoo/i },
    ],
  },
  {
    id: "skin", label: "Skin & facials", items: [
      { id: "hydrafacial", label: "HydraFacial", match: /hydra ?facial/i },
      { id: "peel", label: "Chemical peels", match: /peel/i },
      { id: "microneedling", label: "Microneedling", match: /microneedl|collagen induction|skinpen/i },
      { id: "dermaplane", label: "Dermaplaning", match: /dermaplan/i },
      { id: "facial", label: "Facials", match: /facial/i },
    ],
  },
  {
    id: "wellness", label: "Wellness", items: [
      { id: "iv", label: "IV therapy", match: /\biv\b|drip|infusion/i },
      { id: "shots", label: "Vitamin shots", hint: "B12, lipo shots", match: /b12|vitamin|lipo.?shot|nad/i },
      { id: "weight", label: "Weight loss", hint: "Semaglutide, tirzepatide", match: /weight|semaglut|tirzepat|glp/i },
      { id: "hormones", label: "Hormone therapy", match: /hormone|bhrt|testosterone|trt/i },
    ],
  },
  {
    id: "other", label: "Hair & retail", items: [
      { id: "hair", label: "Hair restoration", match: /hair restor|hair loss|scalp/i },
      { id: "skincare", label: "Medical-grade skincare", hint: "Product sales", match: /skincare|skinceuticals|zo skin|obagi|alastin|retail/i },
    ],
  },
];

export const OFFER_IDS = OFFER_GROUPS.flatMap((g) => g.items.map((i) => i.id));
export const MIN_OFFERED = 3;

/** Item ids to pre-tick from treatment names we read on their site. */
export function prefillOffered(treatmentNames: string[]): string[] {
  const out = new Set<string>();
  for (const name of treatmentNames) {
    for (const g of OFFER_GROUPS) for (const i of g.items) if (i.match.test(name)) out.add(i.id);
  }
  // "Facials" is a catch-all: don't tick it just because a HydraFacial matched.
  if (out.has("facial") && !treatmentNames.some((n) => /facial/i.test(n) && !/hydra ?facial|photofacial/i.test(n))) out.delete("facial");
  return OFFER_IDS.filter((id) => out.has(id));
}

export const CHALLENGES = [
  { id: "no_return", label: "Patients don't come back on schedule" },
  { id: "one_time", label: "Too many one-time visitors" },
  { id: "front_desk", label: "My front desk is too busy to follow up" },
  { id: "slow_days", label: "Slow days and last-minute gaps" },
  { id: "no_recurring", label: "No steady monthly revenue" },
  { id: "few_reviews", label: "Not enough reviews and referrals" },
] as const;

export const PRIORITIES = [
  { id: "recall", label: "Bring patients back before their treatment wears off" },
  { id: "memberships", label: "Sell more memberships" },
  { id: "slow_days", label: "Fill slow days" },
  { id: "reviews", label: "Get more reviews and referrals" },
  { id: "packages", label: "Sell more packages and skincare" },
] as const;

export const PICK = 2;

export type QuizAnswers = { booking_system: string | null; offered: string[]; challenges: string[]; priorities: string[] };

/** Server-side check of submitted answers. Unknown ids are dropped; wrong counts fail. */
export function validateAnswers(raw: Record<string, unknown>): { ok: true; answers: QuizAnswers } | { ok: false; error: string } {
  const pick = (v: unknown, allowed: readonly string[], max: number) =>
    (Array.isArray(v) ? v : []).filter((x): x is string => typeof x === "string" && allowed.includes(x)).filter((x, i, a) => a.indexOf(x) === i).slice(0, max);
  const tool = typeof raw.booking_system === "string" ? raw.booking_system.replace(/[^\p{L}\p{N} .&'-]/gu, "").trim().slice(0, 60) : "";
  const offered = pick(raw.offered, OFFER_IDS, 40);
  const challenges = pick(raw.challenges, CHALLENGES.map((c) => c.id), PICK);
  const priorities = pick(raw.priorities, PRIORITIES.map((p) => p.id), PICK);
  if (offered.length < MIN_OFFERED) return { ok: false, error: `Please pick at least ${MIN_OFFERED} treatments.` };
  if (challenges.length !== PICK) return { ok: false, error: "Please pick 2 things holding you back." };
  if (priorities.length !== PICK) return { ok: false, error: "Please pick your 2 priorities." };
  return { ok: true, answers: { booking_system: tool || null, offered, challenges, priorities } };
}

/** Labels for emails and the admin page. */
export function labelOf(id: string): string {
  for (const g of OFFER_GROUPS) for (const i of g.items) if (i.id === id) return i.label;
  return CHALLENGES.find((c) => c.id === id)?.label ?? PRIORITIES.find((p) => p.id === id)?.label ?? id;
}
