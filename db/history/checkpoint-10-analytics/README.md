# Checkpoint 10 — Analytics dashboard

Real numbers everywhere. The agency dashboard stats are no longer placeholders, and each business now has an Insights tab with KPIs, daily trend charts, and a top-members leaderboard.

## What got built

**Backend — `01_analytics_and_logo_fix.sql`:**
- Fixes the CP 2 logo upload policy (it was using an invalid syntax that silently failed). You'll be able to upload logos after running this.
- `business_analytics(business_id, days)` — 13 KPIs in one call
- `business_daily_activity(business_id, days)` — per-day breakdown for charts
- `top_members(business_id, limit)` — leaderboard query
- `agency_rollup()` — across-all-businesses totals for the agency dashboard

**Agency dashboard:**
- Four stat cards now show real data: Total Businesses, Total Members (across all), Active (30d), Revenue 30d (in dollars)

**Brand editor → new "Insights" tab:**
- Period selector: 7d / 30d / 90d
- **8 KPI cards** — Revenue, Total/New members, Active visits, Points issued, Rewards redeemed, Reviews earned, Referrals
- **4 line charts** — daily revenue, daily transactions, points issued, points redeemed. Inline SVG with brand-colored fill gradients, zero library dependencies.
- **Top members leaderboard** — top 5 by lifetime points, ranked, with tier + visit count
- **Member health card** — Active / Dormant / Avg lifetime points snapshot

## How to install (1 min)

1. Supabase SQL Editor → run [`01_analytics_and_logo_fix.sql`](01_analytics_and_logo_fix.sql). Idempotent.
2. Restart `npm run dev`.

After this, the logo upload should also work (the SQL drops + recreates the missing policy from CP 2).

## How to test

**Logo upload fix:**
1. Brand editor → Brand tab → tap the Logo upload box → pick a PNG → it should now upload and preview

**Agency rollup:**
1. `lvh.me:3000/agency` → top stat cards show real numbers (1 Business, your member count, your activity, total revenue across all)

**Per-business insights:**
1. Click into Demo Rewards (or any business)
2. Click the **Insights** tab (new, between Rewards and Offers)
3. You'll see 8 KPI cards, 4 charts, top-5 members, member health
4. Change the period dropdown — data re-fetches for that window
5. If you haven't done many transactions yet, charts may be flat. Award yourself a few purchases via the manager's keypad to generate data, then refresh the Insights tab.

## What's NOT in CP 10

- **Export to CSV / PDF** — deferred. The data's all queryable; export is a 30-minute add later.
- **Custom date ranges** — fixed 7/30/90 only for MVP. Custom range picker is straightforward to add.
- **Cohort retention chart** — out of scope for MVP. Top-members leaderboard covers the most useful insight.
- **Manager-facing version** — the Insights view is currently only accessible from the brand editor (agency admins). Managers (business_manager role) would access via a different route. Deferred — if you want managers to see their own analytics, we can add a `/manage/insights` route quickly.

## Approval gate

When you've seen the new Insights tab render with real data (or test data after a few transactions), CP 10 is done. Next is **CP 11 — GoHighLevel integration + webhooks**. That one is mostly server-side: outbound webhooks fire when ledger events happen, inbound webhooks let GHL push purchases/bookings into the rewards system automatically.

After CP 11 comes **CP 12 — push/SMS/email + launch polish**, and you'll be at the end of the original roadmap.
