/**
 * Med spa quiz — the answers it asks for and the estimate it ends on (CP-182).
 *
 * The idea: patients on a treatment cycle (neurotoxin wears off in 3–4 months,
 * per the American Society of Plastic Surgeons) drift away between visits.
 * Atlas sends the "you're due" reminder, the win-back and the membership offer,
 * and recovers SOME of those missed visits.
 *
 * Messaging Library rule: only real numbers, sources named. The recovery rates
 * in SCENARIOS are planning assumptions, NOT measurements. Replace them with
 * real results once the first spas have 60–90 days of data.
 */
import type { Band } from "./quiz-model";

/** "How many patient visits do you have in a typical month?" */
export const VISIT_BANDS: Band[] = [
  { id: "v1", label: "Under 100", sub: "Solo injector or a new practice", mid: 70 },
  { id: "v2", label: "100 – 250", sub: "A busy single location", mid: 175 },
  { id: "v3", label: "250 – 500", sub: "Several providers", mid: 375 },
  { id: "v4", label: "500 – 1,000", sub: "A packed schedule", mid: 700 },
  { id: "v5", label: "1,000 +", sub: "Multiple rooms or locations", mid: 1200 },
];

/** "What's a typical visit worth?" */
export const VALUE_BANDS: Band[] = [
  { id: "a1", label: "Under $150", sub: "Facials, peels, add-ons", mid: 120 },
  { id: "a2", label: "$150 – $300", sub: "Skin treatments, small areas", mid: 225 },
  { id: "a3", label: "$300 – $500", sub: "Neurotoxin, most injectables", mid: 400 },
  { id: "a4", label: "$500 – $900", sub: "Filler, laser packages", mid: 650 },
  { id: "a5", label: "$900 +", sub: "Big-ticket treatments", mid: 1100 },
];

/**
 * "Of patients due for their next treatment, how many book it on time?"
 * `lapse` = share of due visits that DON'T happen on time.
 */
export const REBOOK: Array<{ id: string; label: string; sub: string; lapse: number }> = [
  { id: "most", label: "Most of them (80%+)", sub: "We're good at rebooking", lapse: 0.2 },
  { id: "half", label: "About half", sub: "Some come back, some drift", lapse: 0.5 },
  { id: "few", label: "Fewer than half", sub: "A lot of one-and-done", lapse: 0.65 },
  { id: "unknown", label: "Honestly, not sure", sub: "We don't track it", lapse: 0.5 },
];

/** "How do you reach patients who are overdue today?" `factor` trims the lift. */
export const RECALL: Array<{ id: string; label: string; sub: string; factor: number }> = [
  { id: "nothing", label: "We don't, really", sub: "They book when they remember", factor: 1 },
  { id: "manual", label: "Front desk calls or texts", sub: "When there's time", factor: 0.85 },
  { id: "auto", label: "Our booking software sends reminders", sub: "Automated, but generic", factor: 0.7 },
  { id: "app", label: "We already use a patient app", sub: "RepeatMD or similar", factor: 0.5 },
];

/** Share of lapsed visits Atlas wins back (planning assumptions). */
export const SCENARIOS = { low: 0.03, likely: 0.05, high: 0.08 } as const;

export const CYCLE_SOURCE = "American Society of Plastic Surgeons (neurotoxin lasts 3–4 months)";

export type MedspaEstimate = {
  baselineYear: number;
  lapsedVisits: number;
  low: number; likely: number; high: number;
  lowPct: number; likelyPct: number; highPct: number;
  recovered: number;
  perMonth: number;
};

function roundMoney(n: number) {
  if (n >= 10000) return Math.round(n / 500) * 500;
  return Math.max(100, Math.round(n / 100) * 100);
}

export function estimateMedspa(visitsPerMonth: number, valuePerVisit: number, lapse: number, factor: number): MedspaEstimate {
  const visits = visitsPerMonth * 12;
  const lapsed = visits * lapse;
  const run = (rate: number) => {
    const recovered = lapsed * rate * factor;
    return { recovered, revenue: recovered * valuePerVisit, pct: recovered / visits };
  };
  const lo = run(SCENARIOS.low), mid = run(SCENARIOS.likely), hi = run(SCENARIOS.high);
  return {
    baselineYear: visits * valuePerVisit,
    lapsedVisits: Math.round(lapsed),
    low: roundMoney(lo.revenue), likely: roundMoney(mid.revenue), high: roundMoney(hi.revenue),
    lowPct: lo.pct, likelyPct: mid.pct, highPct: hi.pct,
    recovered: Math.round(mid.recovered),
    perMonth: roundMoney(mid.revenue / 12),
  };
}
