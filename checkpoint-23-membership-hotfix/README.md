# Checkpoint 23 — Membership hotfix + Active Rewards polish

Andrew applied CP-22 SQL and hit three problems:

1. `ERROR: 42P01: relation "public.business_membership_billing" does not exist`
   — CP-22 assumed CP-20 had created that table.
2. `Could not find the function public.upsert_membership_billing(...) in the
   schema cache` — same chain reaction. Function was never created because
   the migration aborted on (1).
3. `new row violates row-level security policy` on image upload — the
   membership-images bucket existed but `storage.objects` had no INSERT
   policy for it.

He also called out two UI things:

4. Brand Editor phone preview still showed the legacy
   `Membership perks / See tiers / Bronze 0+ / Silver 500+ / Gold 1,500+`
   block — Atlas is single-membership now.
5. "Your active rewards" rows are plain white and have no image. Make them
   dramatic. The goal of that surface is to get customers back through the door.

## What CP-23 ships

### SQL — [`01_membership_and_storage.sql`](./01_membership_and_storage.sql)

Self-contained and idempotent. Safe to paste even if you skipped CP-20 / CP-22.

- `CREATE TABLE IF NOT EXISTS business_membership_billing` with every column
  the agency form needs (price, perks, cash balance, points multiplier,
  priority booking, image URL).
- Defensive `is_business_manager()` and `current_app_role()` fallbacks so
  the RLS clauses below work even on a database that never ran CP-22.
- Tightened RLS — front desk cannot read or write membership billing.
- `membership_billing_public()` extended to expose the new benefit fields
  to customers (Stripe key still stripped).
- `upsert_membership_billing(...)` RPC — the Save button on the agency form
  calls this in a single round-trip.
- **Storage RLS** for both `membership-images` and `offer-images` buckets:
  - public read for `anon` + `authenticated`
  - insert/update/delete for `authenticated`
  This fixes the "row violates RLS policy" error on upload.
- Extended `my_redemptions()` to return the reward image URL so the new
  Active Rewards row can render it without an extra fetch.
- `notify pgrst, 'reload schema'` at the bottom so the new RPC signatures
  are visible immediately.

### UI

- `components/customer-preview/customer-preview.tsx` — legacy multi-tier
  block ripped out. Replaced with a single-membership preview card that
  uses the business's brand colors and shows four representative benefit
  pills (Cash credit / Member savings / Priority booking / x1.2 Points).
  A footnote explains the values come from the Membership tab so the agency
  knows where to configure the real numbers.
- `components/customer/active-redemptions.tsx`:
  - Each row is now a **gradient card** using the business's brand color.
    When the urgency hits "urgent" or "expired" the gradient leans rose
    so the row reads as an alarm.
  - Reward image on the left (or a Gift icon fallback for older DBs that
    haven't applied the new `my_redemptions` yet).
  - White-on-color "Active reward" label + bigger reward name.
  - Code is in a translucent pill so it stays readable on the gradient.
  - The CP-22 countdown pill now sits on a white background with bold
    colored text for high contrast against the new row color.
  - Section header now has a pulsing rose "Use it before you lose it" badge.

## To apply

1. Supabase SQL editor → New query → paste `01_membership_and_storage.sql`
   → Run. Idempotent, safe to re-run.
2. Reload the Atlas tab in your browser.
3. Agency Brand Editor → Membership tab: configure your membership (the
   image upload will now succeed).
4. Customer-side: redeem a reward to see the dramatic new card. The reward
   image will appear if you've uploaded one in the Rewards manager.

## About the missing offer banner on the customer view

The screenshot of `demo.lvh.me:3000/app` had no banner. CP-21 wires the
banner up correctly — it just only renders when there IS a featured offer.
Two things to check on the demo data:

- Brand Editor → Offers → at least one custom offer exists, and it has the
  ⭐ Featured toggle on. There can be only one featured offer at a time.
- Brand & widgets → Engagement → Offers & promos widget is **on**. The
  banner respects that flag.

Once both are true the blue urgency bar will show across every customer tab.
