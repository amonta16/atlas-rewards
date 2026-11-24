/**
 * lib/landing/case-studies.ts — CP-275 · client results for the Results section on /medspa/app,
 * managed in Admin → Reviews & Results → Results.
 *
 * Rows: `site_case_studies` (RLS on, no policies: only the service role reads/writes, through
 * /api/site-results and /api/agency/site-results). Photos and logos: the public `site-reviews`
 * bucket under c/. SQL: db/history/checkpoint-275-case-studies.
 *
 * Only real results go live: numbers from the clinic's own Atlas dashboard, with the owner's OK.
 * New rows start hidden; switch one on when it's ready.
 */
import type { ResultUse } from "./medspa-funnel";

export const CASE_BUCKET = "site-reviews";
export const CASE_PATH_RE = /^c\/[a-z0-9-]{8,80}\.(png|jpg|webp|gif|avif)$/;
export const RESULT_USES: Array<{ id: ResultUse; label: string }> = [
  { id: "memberships", label: "Memberships" },
  { id: "rewards", label: "Rewards" },
  { id: "recall", label: "Due-date reminders" },
  { id: "shop", label: "In-app shop" },
  { id: "push", label: "Push offers" },
];
export const isResultUse = (v: unknown): v is ResultUse => RESULT_USES.some((u) => u.id === v);

export type CaseStat = { value: string; label: string };

/** What the public page gets. */
export type CaseStudy = {
  id: string; clinic: string; headline: string; stats: CaseStat[]; uses: ResultUse[];
  photo_url: string | null; logo_url: string | null; youtube: string | null;
};

/** What the admin page gets. */
export type CaseStudyRow = CaseStudy & {
  photo_path: string | null; logo_path: string | null; active: boolean; sort_order: number; created_at: string;
};

/** A YouTube id from an id or any youtube.com / youtu.be link; null if it isn't one. */
export function youtubeId(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m = s.match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}
