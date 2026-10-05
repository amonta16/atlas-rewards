/**
 * lib/medspa.ts — CP-185 · Med spa practice model
 *
 * Everything the med spa builder edits lives in ONE jsonb column,
 * businesses.medspa_config (added in CP-185, default '{}'). Non-med-spa
 * businesses never read it: the builder only shows the med spa tabs when
 * layout_preset === "medspa", and the patient-app modules that read this
 * config are listed only in LAYOUT_PRESETS.medspa.home.
 *
 * What is REAL today vs. what is a placeholder is spelled out per section
 * in the builder (MedspaStudio). Short version:
 *   · Treatments, providers, aftercare, gallery, credit rules — stored and
 *     rendered in the patient app.
 *   · Treatment log — real table (medspa_treatment_log); the desk writes it,
 *     the patient's "next treatment" card reads it.
 *   · Recall sending — NOT built. The config (timing + message) is stored
 *     and previewed; nothing sends yet. The builder says so.
 *   · Credit balance — computed from months paid × monthly credit minus
 *     credit used on logged treatments. No ledger table yet; labeled
 *     "estimated" in the builder.
 */

export type MedspaTreatment = {
  id: string;
  name: string;
  /** Short menu group: "Injectables", "Skin", "Laser", "Body", "Wellness". */
  category: string;
  /** How long results last → when recall fires. null = no recall (consults). */
  recall_weeks: number | null;
  duration_minutes: number;
  price_cents: number | null;
  /** Shown to members when credits/memberships are on. null = same price. */
  member_price_cents: number | null;
  description: string;
  /** One instruction per line. Shown in the app after a logged treatment. */
  aftercare: string[];
  image_url: string | null;
  is_active: boolean;
};

export type MedspaProvider = {
  id: string;
  name: string;
  /** "Nurse injector, RN" / "Medical director, MD" / "Licensed esthetician". */
  title: string;
  bio: string;
  photo_url: string | null;
  /** Treatment ids this provider performs. Empty = all. */
  treatment_ids: string[];
  is_active: boolean;
};

export type MedspaGalleryItem = {
  id: string;
  title: string;
  treatment_id: string | null;
  before_url: string | null;
  after_url: string | null;
  caption: string;
  /** Written patient consent on file. Items without it never render publicly. */
  consent: boolean;
};

export type MedspaCredits = {
  enabled: boolean;
  /** Monthly credit the membership banks toward treatments. */
  monthly_credit_cents: number;
  /** How many unused months can roll forward. 0 = use it or lose it. */
  rollover_months: number;
  /** Shown under the balance in the app. */
  note: string;
};

export type MedspaRecall = {
  enabled: boolean;
  /** Days BEFORE the due date the first reminder goes out. */
  lead_days: number;
  /** Days AFTER the due date the quiet-patient follow-up goes out. */
  followup_days: number;
  channel: "push" | "sms" | "both";
  /** Templates. Tokens: {first_name} {treatment} {practice} {due_date} {incentive} */
  message_due: string;
  message_followup: string;
  /** Optional sweetener appended via {incentive}. Empty = none. */
  incentive: string;
};

export type MedspaConfig = {
  treatments: MedspaTreatment[];
  providers: MedspaProvider[];
  gallery: MedspaGalleryItem[];
  credits: MedspaCredits;
  recall: MedspaRecall;
  /** Patient app: show treatment history + aftercare under "My care". */
  show_history: boolean;
  /** Patient app: let patients pick a provider when booking (display only until booking carries providers). */
  pick_provider: boolean;
  /** Shown on the "My care" tab when a patient has no treatments logged yet. */
  welcome_note: string;
};

export const MEDSPA_CATEGORIES = ["Injectables", "Skin", "Laser", "Body", "Wellness", "Consult"] as const;

export const DEFAULT_MEDSPA_CONFIG: MedspaConfig = {
  treatments: [],
  providers: [],
  gallery: [],
  credits: { enabled: false, monthly_credit_cents: 0, rollover_months: 2, note: "Credits apply to any treatment on the menu." },
  recall: {
    enabled: false,
    lead_days: 14,
    followup_days: 21,
    channel: "push",
    message_due: "{first_name}, your {treatment} is due around {due_date}. Book this week and we'll hold your usual time. {incentive}",
    message_followup: "{first_name}, it's been a bit since your {treatment}. Your results hold best on schedule — want us to find you a spot?",
    incentive: "",
  },
  show_history: true,
  pick_provider: true,
  welcome_note: "Your treatments, aftercare and due dates will show up here after your first visit.",
};

/** Starter menu an owner can load with one tap, then edit. Recall windows are typical, not medical advice. */
export const MEDSPA_STARTER_TREATMENTS: Omit<MedspaTreatment, "id">[] = [
  { name: "Neurotoxin", category: "Injectables", recall_weeks: 12, duration_minutes: 30, price_cents: null, member_price_cents: null, description: "Smooths lines in the forehead, between the brows and around the eyes.", aftercare: ["Stay upright for 4 hours", "Skip workouts and alcohol today", "No facials or massage on the area for 24 hours", "Full results in 10–14 days"], image_url: null, is_active: true },
  { name: "Dermal filler", category: "Injectables", recall_weeks: 39, duration_minutes: 45, price_cents: null, member_price_cents: null, description: "Restores volume and shape in lips, cheeks and jawline.", aftercare: ["Ice 10 minutes on, 10 off for swelling", "Avoid pressure on the area for 48 hours", "Skip alcohol and heavy exercise for 24 hours", "Swelling settles in about 2 weeks"], image_url: null, is_active: true },
  { name: "Lip filler", category: "Injectables", recall_weeks: 26, duration_minutes: 45, price_cents: null, member_price_cents: null, description: "Shape and hydration for the lips.", aftercare: ["Ice gently today", "No straws, kissing or lip products for 24 hours", "Sleep with your head slightly raised tonight"], image_url: null, is_active: true },
  { name: "HydraFacial", category: "Skin", recall_weeks: 4, duration_minutes: 60, price_cents: null, member_price_cents: null, description: "Cleanse, extract and hydrate in one treatment.", aftercare: ["Skip makeup for the rest of the day", "No exfoliants or retinol for 48 hours", "SPF every morning"], image_url: null, is_active: true },
  { name: "Microneedling", category: "Skin", recall_weeks: 5, duration_minutes: 60, price_cents: null, member_price_cents: null, description: "Stimulates collagen for texture, scars and tone.", aftercare: ["Expect redness for 24–48 hours", "Only gentle cleanser and the serum we sent home for 3 days", "No sun, sweat or makeup for 24 hours"], image_url: null, is_active: true },
  { name: "Chemical peel", category: "Skin", recall_weeks: 4, duration_minutes: 30, price_cents: null, member_price_cents: null, description: "Resurfaces for brightness and even tone.", aftercare: ["Do not pick or peel flaking skin", "Moisturize and SPF daily", "No actives for 5–7 days"], image_url: null, is_active: true },
  { name: "Laser hair removal", category: "Laser", recall_weeks: 6, duration_minutes: 30, price_cents: null, member_price_cents: null, description: "A series of sessions, usually 6–8, spaced about 6 weeks apart.", aftercare: ["Keep the area out of the sun for 2 weeks", "Cool compress for any warmth", "Shave, never wax, between sessions"], image_url: null, is_active: true },
  { name: "IPL photofacial", category: "Laser", recall_weeks: 4, duration_minutes: 30, price_cents: null, member_price_cents: null, description: "Targets sun spots, redness and broken capillaries.", aftercare: ["Spots darken then flake over 7–10 days", "No sun or tanning for 2 weeks", "SPF 30+ daily"], image_url: null, is_active: true },
  { name: "Consultation", category: "Consult", recall_weeks: null, duration_minutes: 30, price_cents: 0, member_price_cents: null, description: "Meet your provider and build a treatment plan.", aftercare: [], image_url: null, is_active: true },
];

export const RECALL_TOKENS = ["{first_name}", "{treatment}", "{practice}", "{due_date}", "{incentive}"] as const;

/** Merge whatever is in the column over the defaults so old rows never break the UI. */
export function readMedspaConfig(raw: unknown): MedspaConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<MedspaConfig>;
  return {
    ...DEFAULT_MEDSPA_CONFIG,
    ...r,
    treatments: Array.isArray(r.treatments) ? r.treatments : [],
    providers: Array.isArray(r.providers) ? r.providers : [],
    gallery: Array.isArray(r.gallery) ? r.gallery : [],
    credits: { ...DEFAULT_MEDSPA_CONFIG.credits, ...(r.credits ?? {}) },
    recall: { ...DEFAULT_MEDSPA_CONFIG.recall, ...(r.recall ?? {}) },
  };
}

export function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
}

/* ───────────── due-date math ───────────── */

export type TreatmentLogRow = {
  id: string;
  business_id: string;
  user_id: string;
  treatment_id: string;
  treatment_name: string;
  provider_id: string | null;
  provider_name: string | null;
  recall_weeks: number | null;
  performed_at: string;
  notes: string | null;
  credit_used_cents: number;
  created_at?: string;
};

export function dueDateFor(row: Pick<TreatmentLogRow, "performed_at" | "recall_weeks">): Date | null {
  if (!row.recall_weeks) return null;
  return new Date(new Date(row.performed_at).getTime() + row.recall_weeks * 7 * 86_400_000);
}

export type DueState = { tone: "fresh" | "soon" | "due" | "overdue"; label: string; days: number };

/** "Due in 3 weeks" / "Due this week" / "Due now" / "2 weeks overdue". */
export function describeDue(due: Date, now = new Date()): DueState {
  const days = Math.round((due.getTime() - now.getTime()) / 86_400_000);
  if (days > 21) return { tone: "fresh", label: `Due in ${Math.round(days / 7)} weeks`, days };
  if (days > 7) return { tone: "soon", label: `Due in ${days} days`, days };
  if (days >= 0) return { tone: "due", label: days === 0 ? "Due today" : "Due this week", days };
  const w = Math.round(-days / 7);
  return { tone: "overdue", label: w < 1 ? `${-days} days overdue` : `${w} week${w === 1 ? "" : "s"} overdue`, days };
}

/** The most useful upcoming item per treatment: latest log row for each treatment with a recall. */
export function nextDue(rows: TreatmentLogRow[]): { row: TreatmentLogRow; due: Date; state: DueState }[] {
  const latest = new Map<string, TreatmentLogRow>();
  for (const r of rows) {
    const cur = latest.get(r.treatment_id);
    if (!cur || new Date(r.performed_at) > new Date(cur.performed_at)) latest.set(r.treatment_id, r);
  }
  return [...latest.values()]
    .map((row) => { const due = dueDateFor(row); return due ? { row, due, state: describeDue(due) } : null; })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => a.due.getTime() - b.due.getTime());
}

export function fillTemplate(tpl: string, v: { first_name: string; treatment: string; practice: string; due_date: string; incentive: string }) {
  return tpl
    .replace(/\{first_name\}/g, v.first_name).replace(/\{treatment\}/g, v.treatment)
    .replace(/\{practice\}/g, v.practice).replace(/\{due_date\}/g, v.due_date)
    .replace(/\{incentive\}/g, v.incentive).replace(/\s{2,}/g, " ").trim();
}

/* ───────────── credits (estimated; no ledger yet) ───────────── */

export type CreditEstimate = { balance_cents: number; earned_cents: number; used_cents: number; months: number; next_credit_on: Date | null };

/**
 * Months paid × monthly credit, capped by rollover, minus credits used on
 * logged treatments. `paidSince` is business_memberships.membership_paid_at.
 */
export function estimateCredits(cfg: MedspaCredits, paidSince: string | null, status: string | null, rows: TreatmentLogRow[], now = new Date()): CreditEstimate | null {
  if (!cfg.enabled || cfg.monthly_credit_cents <= 0) return null;
  if (status !== "paid" || !paidSince) return { balance_cents: 0, earned_cents: 0, used_cents: 0, months: 0, next_credit_on: null };
  const start = new Date(paidSince);
  const months = Math.max(1, Math.floor((now.getTime() - start.getTime()) / (30.44 * 86_400_000)) + 1);
  const bankable = Math.min(months, cfg.rollover_months + 1);
  const used = rows.reduce((s, r) => s + (r.credit_used_cents || 0), 0);
  const earned = bankable * cfg.monthly_credit_cents;
  const next = new Date(start); next.setMonth(start.getMonth() + months);
  return { balance_cents: Math.max(0, earned - used), earned_cents: earned, used_cents: used, months, next_credit_on: next };
}

export function cents(n: number | null | undefined) {
  if (n == null) return "";
  return `$${(n / 100).toLocaleString(undefined, { maximumFractionDigits: n % 100 ? 2 : 0 })}`;
}

export function weeksLabel(w: number | null) {
  if (!w) return "No recall";
  if (w >= 8) { const m = Math.round(w / 4.33); return `Every ${m} month${m === 1 ? "" : "s"}`; }
  return `Every ${w} weeks`;
}
