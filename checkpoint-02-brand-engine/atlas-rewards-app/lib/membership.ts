/**
 * membership.ts — CP-108
 *
 * ONE reading of a business's membership config, shared by every surface:
 * the builder panel, the customer join card, the join modal and the phone
 * preview. Before this, each surface re-derived the same facts inline with
 * its own `?? true` / `?? []` fallbacks, and they disagreed:
 *
 *   · the join card said "or grab a pass" but never showed the passes
 *   · with monthly off it rendered "$25.00 one-time pass" for one pass and
 *     "$25.00 · passes from" for several — the label logic was inverted
 *   · a one-time pass buyer was still told "Cancel anytime"
 *   · a config with monthly off and zero passes still rendered a Join button
 *
 * Everything below is pure — no React, no fetching — so the same numbers and
 * the same words appear everywhere.
 */

export type MembershipPass = {
  id: string;
  label: string;
  /** 1–24. A pass is a one-time purchase that expires after this many months. */
  months: number;
  price_cents: number;
};

export type PaymentMode = "stripe" | "external_link" | "in_person";

/** A single thing a customer can actually buy. */
export type MembershipOffer =
  | { kind: "monthly"; id: "monthly"; label: string; priceCents: number; months: null }
  | { kind: "pass"; id: string; label: string; priceCents: number; months: number };

/** The shape the RPC / table row arrives in. Every CP-86 field is optional
 *  because a database without that migration simply omits the columns. */
export type MembershipRow = {
  is_enabled?: boolean | null;
  membership_name?: string | null;
  price_cents?: number | null;
  perks?: string[] | null;
  points_multiplier?: number | null;
  has_priority_booking?: boolean | null;
  image_url?: string | null;
  payment_mode?: PaymentMode | null;
  external_payment_url?: string | null;
  payment_instructions?: string | null;
  pass_options?: MembershipPass[] | null;
  offer_monthly?: boolean | null;
} | null | undefined;

export type MembershipView = {
  enabled: boolean;
  name: string;
  perks: string[];
  pointsMultiplier: number;
  priorityBooking: boolean;
  monthlyOffered: boolean;
  monthlyPriceCents: number;
  passes: MembershipPass[];
  /** Everything buyable, monthly first. Empty = nothing to sell. */
  offers: MembershipOffer[];
  /** False when the business has membership on but nothing purchasable. */
  purchasable: boolean;
  /** Cheapest entry point, for the headline price. */
  fromCents: number | null;
  /** True when there is more than one way in (so "from" is meaningful). */
  hasChoice: boolean;
  paymentMode: PaymentMode;
  externalUrl: string | null;
  instructions: string | null;
  /**
   * True when the row came back WITHOUT the CP-86 columns — i.e. that
   * migration was never applied here. Passes cannot work in that state, and
   * every surface should say so rather than silently pretending monthly is on.
   */
  legacySchema: boolean;
};

export function money(cents: number): string {
  const v = (cents ?? 0) / 100;
  // Whole dollars read better on a card: $25, not $25.00.
  return Number.isInteger(v) ? `$${v}` : `$${v.toFixed(2)}`;
}

/** "1-Year Pass" style default when a business didn't name it. */
export function defaultPassLabel(months: number): string {
  if (months === 12) return "1-Year Pass";
  if (months === 24) return "2-Year Pass";
  return `${months}-Month Pass`;
}

/** "$120 · 12 months" — the way a pass reads everywhere. */
export function passSubtitle(p: MembershipPass): string {
  return `${p.months} month${p.months === 1 ? "" : "s"} · one-time`;
}

export function readMembership(row: MembershipRow): MembershipView {
  const legacySchema = !!row && (!("offer_monthly" in row) || !("pass_options" in row));

  const monthlyPriceCents = row?.price_cents ?? 0;
  // A legacy database can't express "monthly off", so it is on by definition.
  const monthlyOffered = legacySchema ? true : (row?.offer_monthly ?? true);
  const passes = (row?.pass_options ?? [])
    .filter(p => p && p.price_cents > 0 && p.months > 0)
    .map(p => ({ ...p, label: p.label?.trim() || defaultPassLabel(p.months) }))
    .sort((a, b) => a.months - b.months);

  const offers: MembershipOffer[] = [];
  if (monthlyOffered && monthlyPriceCents > 0) {
    offers.push({ kind: "monthly", id: "monthly", label: "Monthly", priceCents: monthlyPriceCents, months: null });
  }
  for (const p of passes) {
    offers.push({ kind: "pass", id: p.id, label: p.label, priceCents: p.price_cents, months: p.months });
  }

  const fromCents = offers.length ? Math.min(...offers.map(o => o.priceCents)) : null;

  return {
    enabled: !!row?.is_enabled,
    name: row?.membership_name?.trim() || "Membership",
    perks: (row?.perks ?? []).filter(Boolean),
    pointsMultiplier: row?.points_multiplier ?? 1,
    priorityBooking: !!row?.has_priority_booking,
    monthlyOffered,
    monthlyPriceCents,
    passes,
    offers,
    purchasable: offers.length > 0,
    fromCents,
    hasChoice: offers.length > 1,
    paymentMode: (row?.payment_mode ?? "in_person") as PaymentMode,
    externalUrl: row?.external_payment_url ?? null,
    instructions: row?.payment_instructions ?? null,
    legacySchema,
  };
}

/**
 * The fine print under a Join button. Only the Stripe mode may claim Stripe
 * checkout, and "Cancel anytime" is a lie on a one-time pass — so the wording
 * is derived from BOTH the payment mode and what is actually being bought.
 */
export function joinFinePrint(v: MembershipView, chosen?: MembershipOffer | null): string {
  const isPass = chosen?.kind === "pass" || (!v.monthlyOffered && v.passes.length > 0);
  const how =
    v.paymentMode === "stripe"        ? "Secure checkout via Stripe" :
    v.paymentMode === "external_link" ? "Payment handled by the business" :
                                        "Set up in person at the counter";
  return isPass ? `One-time payment · ${how}` : `Cancel anytime · ${how}`;
}

/** Reasons this config cannot go live. Empty = ready. Used by the builder. */
export function membershipBlockers(v: MembershipView, hasStripeKey: boolean): string[] {
  const out: string[] = [];
  if (v.paymentMode === "stripe" && !hasStripeKey) {
    out.push("Paste your Stripe secret key — without it nobody can check out.");
  }
  if (v.paymentMode === "external_link" && !v.externalUrl) {
    out.push("Add the payment link — it's the page members get sent to.");
  }
  if (!v.purchasable) {
    out.push(
      v.monthlyOffered && v.monthlyPriceCents <= 0
        ? "Set a monthly price above $0, or add a pass."
        : "Nothing is for sale — switch the monthly plan on, or add at least one pass.",
    );
  }
  return out;
}
