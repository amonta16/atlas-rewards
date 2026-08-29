/**
 * lib/founder-hq.ts — CP-111
 *
 * Shared constants + helpers for the Founder Headquarters and Revenue
 * Analytics pages. The revenue math here MUST stay in sync with the SQL
 * in checkpoint-111-founder-hq/cp111_founder_hq.sql
 * (pipeline_default_probability + record_agency_revenue_snapshot):
 *
 *   Live MRR       = Σ monthly_cents of ACTIVE agency_billing_subscriptions
 *   Raw pipeline   = Σ est_monthly_cents of OPEN opportunities, excluding
 *                    ones whose converted business already pays (no
 *                    double counting)
 *   Weighted       = Σ est_monthly_cents × win probability (per-row value,
 *                    else the stage default)
 */
import type { PipelineOpportunity } from "@/lib/types/database";

/* ───────────────────────────── Stages ───────────────────────────── */

export type SalesStage =
  | "prepared_app" | "business_contacted" | "demo_completed" | "follow_up"
  | "trial_proposal" | "verbal_commitment" | "won" | "lost"
  // Legacy CP-50 values — remapped by cp111, but tolerated if a stale row
  // slips through so the UI never crashes on old data.
  | "lead" | "contacted" | "in_talks" | "proposal";

export const SALES_STAGES: { key: SalesStage; label: string; tint: string; defaultProb: number }[] = [
  { key: "prepared_app",       label: "Prepared App",       tint: "#64748b", defaultProb: 5 },
  { key: "business_contacted", label: "Business Contacted", tint: "#38bdf8", defaultProb: 10 },
  { key: "demo_completed",     label: "Demo Completed",     tint: "#22d3ee", defaultProb: 25 },
  { key: "follow_up",          label: "Follow-Up",          tint: "#818cf8", defaultProb: 35 },
  { key: "trial_proposal",     label: "Trial / Proposal",   tint: "#a78bfa", defaultProb: 55 },
  { key: "verbal_commitment",  label: "Verbal Commitment",  tint: "#fbbf24", defaultProb: 80 },
  { key: "won",                label: "Won",                tint: "#34d399", defaultProb: 100 },
  { key: "lost",               label: "Lost",               tint: "#fb7185", defaultProb: 0 },
];

const LEGACY_STAGE_MAP: Record<string, SalesStage> = {
  lead: "prepared_app",
  contacted: "business_contacted",
  in_talks: "follow_up",
  proposal: "trial_proposal",
};

/** Normalize any stored stage (incl. legacy CP-50 values) to a CP-111 stage. */
export function normalizeStage(stage: string): SalesStage {
  return (LEGACY_STAGE_MAP[stage] ?? stage) as SalesStage;
}

export function stageMeta(stage: string) {
  const s = normalizeStage(stage);
  return SALES_STAGES.find(x => x.key === s) ?? SALES_STAGES[0];
}

/** Open stages, in funnel order (excludes won/lost). */
export const OPEN_STAGES = SALES_STAGES.filter(s => s.key !== "won" && s.key !== "lost");

/* ───────────────────────────── Sources ──────────────────────────── */

export type LeadSource = "door_to_door" | "instagram" | "youtube" | "paid_ads" | "referral" | "other";

export const LEAD_SOURCES: { key: LeadSource; label: string }[] = [
  { key: "door_to_door", label: "Door-to-Door" },
  { key: "instagram",    label: "Instagram" },
  { key: "youtube",      label: "YouTube" },
  { key: "paid_ads",     label: "Paid Ads" },
  { key: "referral",     label: "Referral" },
  { key: "other",        label: "Other" },
];

export function sourceLabel(key: string): string {
  return LEAD_SOURCES.find(s => s.key === key)?.label ?? key;
}

/* ─────────────────────────── Money & math ───────────────────────── */

export const dollars = (cents?: number | null) =>
  `$${(Math.round(cents ?? 0) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export const dollarsExact = (cents?: number | null) =>
  `$${((cents ?? 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "1234.56" (user input) → cents, or null when not a valid money amount. */
export function parseMoneyToCents(input: string): number | null {
  const clean = input.replace(/[^0-9.]/g, "");
  if (!clean) return null;
  const n = parseFloat(clean);
  if (!Number.isFinite(n) || n < 0 || n > 10_000_000) return null;
  return Math.round(n * 100);
}

/** Effective win probability (row value, else stage default). 0..100. */
export function effectiveProbability(opp: Pick<PipelineOpportunity, "stage" | "win_probability">): number {
  if (opp.win_probability != null && Number.isFinite(opp.win_probability)) {
    return Math.min(100, Math.max(0, opp.win_probability));
  }
  return stageMeta(opp.stage).defaultProb;
}

/**
 * True when this open opportunity's converted business already has a live
 * (active/past_due) subscription — then it is EXCLUDED from pipeline
 * totals so the same business never counts in both live MRR and pipeline.
 */
export function isDoubleCounted(
  opp: Pick<PipelineOpportunity, "converted_business_id" | "status">,
  liveBusinessIds: Set<string>,
): boolean {
  return !!opp.converted_business_id && liveBusinessIds.has(opp.converted_business_id);
}

export type PipelineTotals = {
  rawCents: number;
  weightedCents: number;
  openCount: number;
  avgDealCents: number;
  followupsDue: number;
  expectedThisMonthCents: number;
};

/** Aggregate open-pipeline totals. Mirrors record_agency_revenue_snapshot. */
export function pipelineTotals(
  opps: PipelineOpportunity[],
  liveBusinessIds: Set<string>,
  todayIso: string,           // YYYY-MM-DD in the agency timezone
): PipelineTotals {
  const open = opps.filter(o => o.status === "open" && !isDoubleCounted(o, liveBusinessIds));
  const rawCents = open.reduce((s, o) => s + (o.est_monthly_cents || 0), 0);
  const weightedCents = open.reduce(
    (s, o) => s + Math.round((o.est_monthly_cents || 0) * effectiveProbability(o) / 100), 0);
  const monthPrefix = todayIso.slice(0, 7); // YYYY-MM
  return {
    rawCents,
    weightedCents,
    openCount: open.length,
    avgDealCents: open.length ? Math.round(rawCents / open.length) : 0,
    followupsDue: open.filter(o => o.next_followup_date && o.next_followup_date <= todayIso).length,
    expectedThisMonthCents: open
      .filter(o => o.expected_close_date && o.expected_close_date.slice(0, 7) === monthPrefix)
      .reduce((s, o) => s + (o.est_monthly_cents || 0), 0),
  };
}

/* ─────────────────────── Dates in the agency TZ ─────────────────── */

export const DEFAULT_AGENCY_TZ = "America/Los_Angeles";

/** YYYY-MM-DD for "now" in the given IANA timezone. */
export function todayInTz(tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz || DEFAULT_AGENCY_TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Treat a YYYY-MM-DD as a plain calendar date (noon UTC avoids DST edges). */
export function dateFromIso(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

export function isoAddDays(iso: string, days: number): string {
  const d = dateFromIso(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Monday of the week containing `iso` (door-to-door weeks run Mon–Sun). */
export function weekStart(iso: string): string {
  const d = dateFromIso(iso);
  const dow = d.getUTCDay();           // 0=Sun..6=Sat
  const back = dow === 0 ? 6 : dow - 1;
  return isoAddDays(iso, -back);
}

/** "Mon, Sep 2" style label for a YYYY-MM-DD. */
export function dateLabel(iso: string, opts?: Intl.DateTimeFormatOptions): string {
  return dateFromIso(iso).toLocaleDateString(undefined, {
    weekday: "short", month: "short", day: "numeric", timeZone: "UTC", ...opts,
  });
}

/** "10:00 AM" from a Postgres time value ("10:00:00"). */
export function timeLabel(t?: string | null): string {
  if (!t) return "";
  const [hh, mm] = t.split(":").map(Number);
  if (!Number.isFinite(hh)) return "";
  const h12 = ((hh + 11) % 12) + 1;
  return `${h12}:${String(mm ?? 0).padStart(2, "0")} ${hh < 12 ? "AM" : "PM"}`;
}

/** Days from today (agency TZ) to `iso`; negative = past. */
export function daysUntil(iso: string, todayIso: string): number {
  return Math.round((dateFromIso(iso).getTime() - dateFromIso(todayIso).getTime()) / 86_400_000);
}

/** Friendly countdown chip text. */
export function countdownLabel(iso: string, todayIso: string): string {
  const d = daysUntil(iso, todayIso);
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d > 1) return `In ${d} days`;
  if (d === -1) return "Yesterday";
  return `${-d} days ago`;
}

/* ─────────────────────────── Validation ─────────────────────────── */

/** Meeting / recording links must be real http(s) URLs before we save. */
export function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value.trim());
    return (u.protocol === "https:" || u.protocol === "http:") && !!u.hostname && u.hostname.includes(".");
  } catch {
    return false;
  }
}

export function isValidIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(dateFromIso(value).getTime());
}

/** "HH:MM" 24h from an <input type=time>; empty allowed when optional. */
export function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}
