/**
 * Membership plans, Dermis style: a clinic sells several plans, each with a
 * monthly price, a benefits list and the treatments included every month.
 *
 * Stored in businesses.medspa_config.memberships (JSONB, so no migration).
 * A clinic that hasn't set plans up yet still shows its single legacy
 * membership (membership_billing_public), converted into one plan here.
 */
import type { MembershipView } from "@atlas/core/membership";
import type { MedspaConfig, MedspaTreatment } from "./medspa";

export type IncludedTreatment = {
  /** Links to a treatment on the menu ("View treatment"); null for perks like a tote bag. */
  treatment_id: string | null;
  name: string;
  quantity: number;
  /** "unit", "session", "syringe", "mL"… shown as a small label. */
  unit: string;
  note: string;
};

export type MedspaPlan = {
  id: string;
  name: string;
  /** One line under the name in the grid. */
  tagline: string;
  description: string;
  price_cents: number;
  /** Minimum commitment in months (0 = cancel anytime). */
  commitment_months: number;
  image_url: string | null;
  benefits: string[];
  included: IncludedTreatment[];
  /** Small print under Subscribe ("Sign up to claim a complimentary consultation"). */
  join_bonus: string;
  featured: boolean;
  is_active: boolean;
};

export function readPlans(cfg: MedspaConfig & { memberships?: unknown }, legacy: MembershipView | null, legacyImage: string | null): MedspaPlan[] {
  const raw = Array.isArray(cfg.memberships) ? (cfg.memberships as Partial<MedspaPlan>[]) : [];
  const plans = raw
    .filter((p) => p && p.id && p.name && p.is_active !== false)
    .map((p) => ({
      id: String(p.id), name: String(p.name), tagline: p.tagline ?? "", description: p.description ?? "",
      price_cents: Number(p.price_cents ?? 0), commitment_months: Number(p.commitment_months ?? 0),
      image_url: p.image_url ?? null, benefits: (p.benefits ?? []).filter(Boolean),
      included: (p.included ?? []).filter((i) => i && i.name).map((i) => ({ treatment_id: i.treatment_id ?? null, name: i.name, quantity: Number(i.quantity ?? 1), unit: i.unit ?? "unit", note: i.note ?? "" })),
      join_bonus: p.join_bonus ?? "", featured: !!p.featured, is_active: true,
    }));
  if (plans.length) return plans;

  if (legacy?.enabled && legacy.monthlyPriceCents > 0) {
    return [{
      id: "membership", name: legacy.name, tagline: "Monthly membership", description: "",
      price_cents: legacy.monthlyPriceCents, commitment_months: 0, image_url: legacyImage,
      benefits: legacy.perks, included: [], join_bonus: "", featured: true, is_active: true,
    }];
  }
  return [];
}

export function priceLabel(cents: number | null | undefined): string {
  if (cents == null) return "";
  const v = cents / 100;
  return Number.isInteger(v) ? `$${v.toLocaleString("en-US")}` : `$${v.toFixed(2)}`;
}

/** "From $180": the cheapest option named in a treatment's price. */
export function fromPrice(t: Pick<MedspaTreatment, "price_cents">): string {
  return t.price_cents ? `From ${priceLabel(t.price_cents)}` : "Price on consultation";
}

/* ───────────── example clinic plans ───────────── */

/** Plans for the example clinic. `tid` maps example treatment names to ids. */
export function examplePlans(treatments: MedspaTreatment[]): MedspaPlan[] {
  const tid = (name: string) => treatments.find((t) => t.name.toLowerCase().startsWith(name.toLowerCase()))?.id ?? null;
  const img = (slug: string) => `/medspa-example/${slug}.jpg`;
  const base = { commitment_months: 12, featured: false, is_active: true };
  return [
    {
      ...base, id: "pl_glow", name: "Glow Club", tagline: "Monthly HydraFacial", featured: true,
      description: "Your monthly reset. A Signature HydraFacial every month, member pricing on the whole menu, and skincare savings that add up.",
      price_cents: 9900, image_url: img("t-hydrafacial"),
      benefits: ["Member pricing on every treatment", "10% off all skincare", "Priority booking on weekends", "Points at 2x on every visit"],
      included: [{ treatment_id: tid("HydraFacial"), name: "Signature HydraFacial", quantity: 1, unit: "session", note: "Upgrade to Deluxe for $40." }],
      join_bonus: "Sign up to immediately claim a complimentary skin consultation.",
    },
    {
      ...base, id: "pl_tox", name: "Tox Club", tagline: "Botox, billed monthly",
      description: "Smooth lines, steady results. Spread the cost of your Botox across the year with no deposit, and save on every visit.",
      price_cents: 12900, image_url: img("t-botox"),
      benefits: ["20 units of BOTOX® every quarter", "15% off extra units", "Free touch-up within 14 days", "10% off all skincare"],
      included: [{ treatment_id: tid("BOTOX"), name: "BOTOX® Cosmetic", quantity: 20, unit: "units / quarter", note: "Use them in one visit or split across two." }],
      join_bonus: "Sign up to immediately claim a complimentary consultation.",
    },
    {
      ...base, id: "pl_protect", name: "Prevent & Protect", tagline: "Laser + resurfacing",
      description: "A laser or resurfacing facial every month with $150 banked toward anything on the menu. Built for sun damage, pigment and texture.",
      price_cents: 15000, image_url: img("t-alma-harmony"),
      benefits: ["$150 a month banked toward any treatment", "Member pricing on the whole menu", "5% off skincare"],
      included: [
        { treatment_id: tid("Alma Harmony"), name: "Alma Harmony Laser Facial", quantity: 1, unit: "session", note: "Or swap for a Cutera Xeo session." },
        { treatment_id: null, name: "SPF 50 travel size", quantity: 1, unit: "unit", note: "Picked up at the front desk." },
      ],
      join_bonus: "Sign up to immediately claim a complimentary skin analysis.",
    },
    {
      ...base, id: "pl_lips", name: "Lip Maintenance", tagline: "Filler, spread monthly",
      description: "Keep your lips looking their best. One syringe of JUVÉDERM® every six months, paid monthly with no deposit.",
      price_cents: 11000, image_url: img("t-juvederm"),
      benefits: ["1 syringe of filler every 6 months", "Free dissolve or adjust within 30 days", "Member pricing on all fillers"],
      included: [{ treatment_id: tid("JUVÉDERM"), name: "JUVÉDERM® Ultra (1 mL)", quantity: 1, unit: "syringe / 6 mo", note: "" }],
      join_bonus: "Sign up to immediately claim a complimentary lip consultation.",
    },
    {
      ...base, id: "pl_sculpt", name: "Sculpt", tagline: "Body contouring",
      description: "Build muscle and burn fat with an Emsculpt NEO session every month, plus member pricing on CoolSculpting.",
      price_cents: 29900, image_url: img("t-emsculpt-neo"),
      benefits: ["Member pricing on CoolSculpting", "Free body composition scan each quarter", "Points at 2x on every visit"],
      included: [{ treatment_id: tid("Emsculpt"), name: "Emsculpt NEO", quantity: 1, unit: "session", note: "30 minutes, no downtime." }],
      join_bonus: "Sign up to immediately claim a 15-minute trial session.",
    },
    {
      ...base, id: "pl_tight", name: "Firm & Lift", tagline: "Skin tightening",
      description: "Collagen-building treatments on a schedule that actually works: Morpheus8 twice a year and an Emface session every quarter.",
      price_cents: 45000, image_url: img("t-morpheus8"),
      benefits: ["Morpheus8 every 6 months", "Emface every quarter", "Member pricing on Sofwave™"],
      included: [
        { treatment_id: tid("Morpheus8"), name: "Morpheus8", quantity: 1, unit: "session / 6 mo", note: "" },
        { treatment_id: tid("Emface"), name: "Emface®", quantity: 1, unit: "session / quarter", note: "" },
      ],
      join_bonus: "Sign up to immediately claim a complimentary consultation.",
    },
  ];
}
