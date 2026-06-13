# CP-50 — Agency command center, prospect pipeline, editable baseline

Three things:

1. **Agency metrics, revamped.** The agency dashboard ("My Apps") is now a dark navy command center with an Atlas-blue glow and real charts — focused entirely on **what your sub-accounts pay you**, never their customer revenue. New KPI tiles (MRR, Pipeline value, Collected 30d, Setup outstanding) plus four charts: **MRR growth** (area), **Revenue booked / month** (MRR + setup bars), **MRR by business** (ranked bars), and a **Prospect pipeline funnel**.
2. **Prospect pipeline (CRM).** A new **Pipeline** page (sidebar) for leads that aren't Atlas businesses yet. Add prospects with an estimated monthly value, move them through **Lead → Contacted → In talks → Proposal → Won/Lost**, edit/notes/contact inline. A **Won** prospect has a "Create business" button that opens the New Business flow prefilled with their name. The funnel on the dashboard reflects this board live.
3. **Editable, richer baseline.** The "Pre-Atlas baseline" is now editable any time from a business's **Settings** tab, with a new **Avg spend per visit** field. Because Insights reads the baseline through `atlas_impact_rollup`, any edit instantly changes the "with vs without Atlas" comparison on **both** your Insights tab and the manager's Insights dashboard.

---

## 1. Apply the SQL (required)

Supabase → SQL editor → paste **`cp50_migration.sql`** → Run. Idempotent.

It adds the `agency_pipeline` table (agency-admin RLS), the chart RPCs (`agency_revenue_timeseries`, `agency_mrr_by_business`, `agency_pipeline_summary`), the new `baseline_avg_ticket_cents` column, and upgrades `save_business_baseline` + `atlas_impact_rollup` to use it. No new environment variables.

> Heads-up: `save_business_baseline` and `atlas_impact_rollup` are dropped and recreated (their signatures change). That's expected and handled in the migration.

## 2. Deploy

Push (block below) → Vercel redeploys.

## What shows where

- **Dashboard (`/agency`)** — dark command center: KPI tiles + 4 charts + your business list. The old "Revenue (30d)" tile (which showed the businesses' own customer revenue) is gone — this view is your agency's money only.
- **Pipeline (`/agency/pipeline`)** — the CRM board. Add a lead at the top; drag-free stage moves via the dropdown on each card.
- **Business → Settings tab** — the editable Pre-Atlas baseline card, below Plan & billing.

## Notes on the numbers

- **MRR / MRR by business / growth** come from the billing plans you log via **Log MRR / setup fee** (manual-tracking mode) or from Stripe once connected — so they're populated today from your active plans.
- **Collected (30d)** is real cash (Stripe payments + setup fees marked paid); in manual mode it stays low until you connect Stripe or mark fees paid. **Revenue booked / month** combines recognized MRR + setup so the chart is meaningful now.
- **Pipeline funnel** fills in as you add prospects on the Pipeline page.

## Files

**SQL**
- `cp50_migration.sql`

**New**
- `components/agency/charts.tsx` — dark SVG charts (area, bars, ranked bars, funnel)
- `components/agency/agency-metrics.tsx` — KPI tiles + charts block
- `components/agency/agency-pipeline.tsx` — the CRM board
- `app/(agency)/agency/pipeline/page.tsx` — Pipeline route
- `components/agency/baseline-editor.tsx` — editable baseline card

**Changed**
- `components/agency/agency-dashboard-client.tsx` — dark command-center revamp
- `components/agency/sidebar.tsx` — Pipeline nav item
- `components/agency/business-settings-panel.tsx` — mounts the baseline editor (+ fixes a missing icon import)
- `components/agency/new-business-modal.tsx` — accepts a prefilled name (for "Won → Create business")

---

## Ship it

Run from the repo root (the **Atlas Engine APP** folder):

```bash
git add -A
git commit -m "CP-50: dark agency command center + charts, prospect pipeline CRM, editable baseline"
git push
```
