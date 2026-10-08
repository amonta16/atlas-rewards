/**
 * lib/landing/medspa-funnel.ts — CP-201 · the /medspa ads funnel, one config file.
 *
 *   Ad → /medspa → build your app (3 taps) → your numbers (4 taps) → estimate
 *   → STEP 1: qualify form → GATE → qualified: calendar unlocks + Meta "Lead"
 *                                 → not a fit: nurture email, no calendar, NO Meta signal
 *   → booked: Meta "Schedule" → pre-call page (/medspa/confirm/<token>): video + "confirm I'll be there"
 *   → reminders (24 h, 2 h) → walkthrough → Andrew taps Showed / No-show / Paid
 *   → Paid: Meta "Purchase" (Conversions API) so Meta learns who actually buys.
 *
 * Everything Andrew is likely to tune lives here: who qualifies, the form
 * options, the pre-call video, the price line, reminder timing.
 *
 * Messaging Library rules still apply: no invented results, no price quoted
 * as settled unless PRICE_BEFORE_CALL is set on purpose.
 */

/* ───────────── who qualifies (the gate) ───────────── */

/** Step-1 role question. `qualifies: false` = no calendar. */
export const ROLES = [
  { id: "owner", label: "Owner", qualifies: true },
  { id: "partner", label: "Co-owner or partner", qualifies: true },
  { id: "manager", label: "Practice manager", qualifies: true },
  { id: "provider", label: "Provider, not an owner", qualifies: false },
  { id: "staff", label: "Front desk or staff", qualifies: false },
  { id: "research", label: "Just researching", qualifies: false },
] as const;
export type RoleId = (typeof ROLES)[number]["id"];

/** Step-1 "where are you today" question. */
export const STAGES = [
  { id: "independent", label: "Independent practice, open now", qualifies: true },
  { id: "multi", label: "Independent, more than one location", qualifies: true },
  { id: "franchise", label: "Franchise or chain location", qualifies: false },
  { id: "opening", label: "Opening soon, not seeing patients yet", qualifies: false },
] as const;
export type StageId = (typeof STAGES)[number]["id"];

/**
 * Visit bands from the quiz (lib/landing/medspa-quiz-model.ts VISIT_BANDS ids).
 * All bands qualify for now: a busy solo injector can still be a good fit.
 * If small practices book calls and never buy, set v1 ("Under 100") to false
 * and they'll go to the nurture email instead of the calendar.
 */
export const VISIT_BAND_QUALIFIES: Record<string, boolean> = { v1: true, v2: true, v3: true, v4: true, v5: true };

export type QualifyInput = { role: string; stage: string; visitBand: string | null };
export type QualifyResult = { qualified: boolean; reasons: string[] };

/** The one rule. Runs on the server (the source of truth) and in the browser (for instant UI). */
export function qualify(i: QualifyInput): QualifyResult {
  const reasons: string[] = [];
  const role = ROLES.find((r) => r.id === i.role);
  const stage = STAGES.find((s) => s.id === i.stage);
  if (!role) reasons.push("role_missing");
  else if (!role.qualifies) reasons.push(`role_${role.id}`);
  if (!stage) reasons.push("stage_missing");
  else if (!stage.qualifies) reasons.push(`stage_${stage.id}`);
  if (i.visitBand && VISIT_BAND_QUALIFIES[i.visitBand] === false) reasons.push(`visits_${i.visitBand}`);
  return { qualified: reasons.length === 0, reasons };
}

/* ───────────── step-1 form options ───────────── */

export const BOOKING_SYSTEMS = ["Boulevard", "Vagaro", "Mangomint", "Zenoti", "AestheticsPro", "Square Appointments", "GlossGenius", "Other", "Paper or phone"] as const;

export const TREATMENT_OPTIONS = ["Neurotoxin", "Filler", "Facials / HydraFacial", "Microneedling", "Laser", "Body contouring", "IV / wellness", "Weight loss"] as const;

/* ───────────── the pre-call page ───────────── */

/**
 * The short video on /medspa/confirm/<token> ("Watch this before your call").
 * Record 2–3 minutes: who you are, what the call covers, what it costs (if
 * PRICE_BEFORE_CALL is set), and what to have ready. Paste a Vimeo/YouTube
 * embed URL here. While null, the page shows the written version instead.
 */
export const PRECALL_VIDEO: { embed: string | null; minutes: number } = { embed: null, minutes: 3 };

/**
 * Optional: say the price before the call. The ScaleClients-style funnel does
 * this so only people who can afford it show up. Leave null to keep
 * "quoted on your walkthrough" (current offer of record). Example:
 *   "One flat plan, month to month. Most practices start around $___/month."
 */
export const PRICE_BEFORE_CALL: string | null = null;

/** What to have ready, shown on the pre-call page and in the reminder emails. */
export const PRECALL_PREP = [
  "Your treatment menu, roughly: what you offer and how often patients should come back.",
  "Who runs your front desk and what booking software you use.",
  "Whether you sell memberships today, and how they're billed.",
];

/* ───────────── follow-up timing ───────────── */

export const REMINDERS = {
  /** First reminder, hours before the call. */
  earlyHours: 24,
  /** Second reminder, hours before the call. */
  lateHours: 2,
  /** Qualified but didn't pick a time: one "your times are still open" email after this many hours. */
  unbookedFollowUpHours: 3,
  /** After the call ends, wait this many minutes, then email Andrew the Showed / No-show / Paid links. */
  outcomeAfterMinutes: 30,
} as const;

/**
 * Value sent with Meta's Purchase event when Andrew marks a lead Paid without
 * typing an amount. Internal signal only, never shown to prospects.
 * Override per deal from the email link, or with env META_PURCHASE_VALUE.
 */
export const DEFAULT_PURCHASE_VALUE = Number(process.env.META_PURCHASE_VALUE ?? 500) || 500;

/** Where funnel links point (emails are opened outside the site). */
export const SITE_ORIGIN = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.atlas-engine.app").replace(/\/$/, "");

/* ───────────── CP-202: landing video, offer, A/B tests ───────────── */

/**
 * The landing-page video (hero, "video" variant). Record 60–120 s: who you
 * are, the leak (patients drift between treatments), what Atlas does, "see
 * your app in 60 seconds". Paste a Vimeo/YouTube embed URL. While null, a
 * branded placeholder shows in its place.
 */
export const LANDING_VSL: { embed: string | null; minutes: number; label: string } = {
  embed: null,
  minutes: 2,
  label: "Andrew, founder of Atlas, in 2 minutes",
};

/* ───────────── CP-204: the offer (area lock, founding spots, guarantees) ─────────────
 * Andrew approved the structure on Oct 8 2026. Change numbers here; every page,
 * the area check and the emails read from this block.
 * Rules: honor every guarantee exactly as written, and keep the conditions in the
 * client agreement too. Only promise what Atlas can measure.
 */

/** One med spa per area. A practice's area is this many miles around its zip (per-row override in medspa_territories). */
export const TERRITORY = { radiusMiles: 10 };

/**
 * Founding practices. The setup fee is real: non-founding practices pay setupFull.
 * Founding practices pay setupFounding in exchange for a filmed testimonial and a
 * case study after 90 days. Spots left = spots minus active founding territories.
 * Set active=false when the founding round closes; the page then shows setupFull.
 */
export const FOUNDING = {
  active: true,
  spots: 10,
  setupFull: 1000,
  setupFounding: 500,
  trade: "a short filmed testimonial and a case study after 90 days",
};

export type Guarantee = { id: string; title: string; short: string; body: string; fine: string };
/** Strongest first. The first one leads the ad and the page. */
export const GUARANTEES: Guarantee[] = [
  {
    id: "pays",
    title: "It pays for itself, or you stop paying.",
    short: "Pays for itself in 90 days, or you don't pay until it does",
    body: "If Atlas hasn't brought in more than you've paid us by day 90, you don't pay another dollar until it has. We keep working, free.",
    fine: "Counted from your Atlas dashboard: membership dues collected through your app, plus the price of repeat treatments your desk logs for patients enrolled in your app, compared with the setup and monthly fees you've paid us. Requires your checkout QR code to be out, staff logging treatments at the desk, and at least one membership offered in your app.",
  },
  {
    id: "live7",
    title: "Live in 7 days, or it's on us.",
    short: "Live in 7 days, or setup and month one are free",
    body: "If your app isn't live at your checkout within 7 days of your setup call, your setup is free and your first month is free.",
    fine: "The 7 days start once we have your logo, treatment menu and membership details from the setup call.",
  },
  {
    id: "leave",
    title: "Leave any month. Keep everything.",
    short: "Cancel any month and keep your banners, table tents and patient list",
    body: "No contract. Cancel any month and you keep the banners and table tents we made you, and your patient list is yours to export.",
    fine: "Cancel before your next billing date; you're billed through the end of the current month.",
  },
];

