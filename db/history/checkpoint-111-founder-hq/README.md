# CP-111 — Founder Headquarters + Revenue Analytics

Replaces the old **Analytics** and **Pipeline** tabs with two destinations:

- **/agency/headquarters** — Founder HQ: This-Week overview strip, high-priority
  meetings (+ Google Drive recordings library link, editable in the UI),
  monthly field-sales calendar, shared goals/action items, weekly
  door-to-door activity scorecard.
- **/agency/analytics** — Revenue Analytics: Actual Live MRR vs Raw / Weighted
  Pipeline MRR, honest history chart, and the full opportunity manager
  (the old /agency/pipeline board's records live here now; that route
  permanently redirects).

## Apply order

1. Run `cp111_founder_hq.sql` in the Supabase SQL editor (AFTER
   cp110_security_hardening.sql). Idempotent — safe to re-run.
2. Deploy the app code (same commit).

No destructive changes: `agency_pipeline` rows are kept; legacy stages are
remapped (lead→prepared_app, contacted→business_contacted,
in_talks→follow_up, proposal→trial_proposal) with the original value saved
in the new `legacy_stage` column.

## Calculation rules (SQL + lib/founder-hq.ts must stay in sync)

- **Live MRR** = Σ `monthly_cents` of `agency_billing_subscriptions` with
  `status='active'`. A "Won" opportunity does NOT count until its
  subscription is logged (Log MRR / setup fee) — the UI shows a
  "Won · not live yet" callout until then.
- **Raw Pipeline MRR** = Σ `est_monthly_cents` of `status='open'`
  opportunities, excluding rows whose `converted_business_id` already has
  an active/past_due subscription (no double counting).
- **Weighted Pipeline MRR** = Σ `est_monthly_cents ×` win probability
  (per-deal value, else the stage default from
  `pipeline_default_probability()`): prepared_app 5, business_contacted 10,
  demo_completed 25, follow_up 35, trial_proposal 55, verbal_commitment 80.
- **History**: live-MRR history is derived from real subscription
  start/cancel dates (`agency_live_mrr_daily`). Pipeline history is
  recorded daily into `agency_mrr_snapshots` by
  `record_agency_revenue_snapshot()` (upserts TODAY only — past rows are
  never rewritten, and the table is SELECT-only from the browser).

## Access control

Everything is agency_admin-only: server-side role checks in both pages
plus RLS (`is_agency_admin()`) on `founder_meetings`, `field_sales_events`,
`founder_action_items`, `agency_sales_activity`, `agency_mrr_snapshots`
and (pre-existing) `agency_pipeline`. VAs never see the nav items and are
bounced by the pages if they hit the URLs directly.

## Settings

`agency_settings` gained `recordings_folder_url` (seeded with the current
Drive folder; editable via Headquarters → Meetings → pencil next to
"Recordings library") and `agency_timezone` (default America/Los_Angeles —
drives "today", the calendar, and snapshot dates).
