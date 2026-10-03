/**
 * App quiz — the answers it asks for and the revenue estimate it ends on (CP-181).
 *
 * EVERY number the estimate leans on is in this file, so changing a claim never
 * means touching the component.
 *
 * Messaging Library rule: only real numbers, and industry stats name their
 * source. The one sourced number is the ROLLER 2026 benchmark (members visit
 * 4.9× a year vs 1.3× for non-members). That gap is a CORRELATION — loyal
 * guests are the ones who join — so the model deliberately counts only a slice
 * of it as caused by the app, and only for the share of guests who join.
 * `SCENARIOS` are planning assumptions, not measurements: tune them as Flippo's
 * (and the next venues') real join rates and visit frequency come in.
 */

export type Band = { id: string; label: string; sub?: string; mid: number };

/** "How many guests come through in a typical month?" (midpoint used in the math) */
export const GUEST_BANDS: Band[] = [
  { id: "g1", label: "Under 1,000", sub: "A small, steady crowd", mid: 600 },
  { id: "g2", label: "1,000 – 3,000", sub: "A busy local favorite", mid: 2000 },
  { id: "g3", label: "3,000 – 8,000", sub: "Weekends are packed", mid: 5500 },
  { id: "g4", label: "8,000 – 20,000", sub: "A destination venue", mid: 14000 },
  { id: "g5", label: "20,000 +", sub: "Multiple locations or a big park", mid: 25000 },
];

/** "What does a typical guest spend per visit?" */
export const SPEND_BANDS: Band[] = [
  { id: "s1", label: "Under $15", sub: "Quick play, snacks", mid: 10 },
  { id: "s2", label: "$15 – $30", sub: "Tokens, a game or two", mid: 22 },
  { id: "s3", label: "$30 – $60", sub: "A group outing", mid: 45 },
  { id: "s4", label: "$60 – $120", sub: "Lanes, cages, a party add-on", mid: 85 },
  { id: "s5", label: "$120 +", sub: "Big groups and parties", mid: 150 },
];

/**
 * "How do you bring guests back today?" `factor` scales the lift: a venue that
 * already runs a real loyalty app has less to gain than one that does nothing.
 */
export const RETENTION: Array<{ id: string; label: string; sub: string; factor: number }> = [
  { id: "nothing", label: "Nothing, really", sub: "They come back or they don't", factor: 1 },
  { id: "blasts", label: "Email or text blasts", sub: "When we remember to send one", factor: 0.9 },
  { id: "punch", label: "Punch cards or stamps", sub: "Paper, mostly lost in a pocket", factor: 0.8 },
  { id: "app", label: "A loyalty app or POS rewards", sub: "We already have something", factor: 0.55 },
];

/** The one sourced benchmark. */
export const BENCHMARK = {
  memberVisitsPerYear: 4.9,
  nonMemberVisitsPerYear: 1.3,
  source: "ROLLER 2026 benchmark",
};

/**
 * join   = share of your yearly guests who join the app in year one
 * causal = share of the member-vs-non-member visit gap we credit to the app
 */
export const SCENARIOS = {
  low: { join: 0.1, causal: 0.2 },
  likely: { join: 0.15, causal: 0.25 },
  high: { join: 0.25, causal: 0.3 },
} as const;

export type QuizEstimate = {
  baselineYear: number;
  uniqueGuests: number;
  low: number; likely: number; high: number;
  likelyPct: number; lowPct: number; highPct: number;
  members: number;
  extraVisits: number;
  perMonth: number;
};

function roundMoney(n: number) {
  if (n >= 10000) return Math.round(n / 500) * 500;
  return Math.max(100, Math.round(n / 100) * 100);
}

export function estimate(guestsPerMonth: number, spendPerVisit: number, retentionFactor: number): QuizEstimate {
  const { memberVisitsPerYear: m, nonMemberVisitsPerYear: n } = BENCHMARK;
  const visits = guestsPerMonth * 12;
  const unique = visits / n;
  const run = (s: { join: number; causal: number }) => {
    const members = unique * s.join;
    const extraVisits = members * (m - n) * s.causal * retentionFactor;
    return { members, extraVisits, revenue: extraVisits * spendPerVisit, pct: extraVisits / visits };
  };
  const lo = run(SCENARIOS.low), mid = run(SCENARIOS.likely), hi = run(SCENARIOS.high);
  return {
    baselineYear: visits * spendPerVisit,
    uniqueGuests: Math.round(unique),
    low: roundMoney(lo.revenue), likely: roundMoney(mid.revenue), high: roundMoney(hi.revenue),
    lowPct: lo.pct, likelyPct: mid.pct, highPct: hi.pct,
    members: Math.round(mid.members),
    extraVisits: Math.round(mid.extraVisits),
    perMonth: roundMoney(mid.revenue / 12),
  };
}

export const fmtMoney = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
export const fmtPct = (p: number) => `${p < 0.1 ? (p * 100).toFixed(1) : Math.round(p * 100)}%`;
