# Checkpoint 22 — Single Membership + Role Gating

The bigger lift Andrew asked for after CP-21. Brings Atlas in line with the
Dermis-style "one membership, lots of benefits" model, locks Billing and
Insights down to managers (front-desk staff can no longer even fetch the
data), and polishes the customer signup flow end-to-end.

## What's in it

### 1. SQL — `01_roles_and_membership.sql`

Single, paste-able, idempotent migration. Two halves:

**A) Role gating**
- New `public.is_business_manager(b_id)` — true for `agency_admin` + `business_manager`, false for `business_staff`.
- `public.current_app_role(b_id)` — thin RPC the UI calls once on mount so it knows which tabs to render.
- Tighter RLS on `business_membership_billing` (was `staffs_business`, now `is_business_manager`).
- `business_analytics_rollup()` rewritten to require `is_business_manager(p_business_id)`. Calling it as a `business_staff` session now returns zero rows.

**B) Single-membership fields**
- Extended `business_membership_billing` with:
  - `monthly_cash_balance_cents int` (Dermis "£29/mo" feature)
  - `points_multiplier numeric` (e.g. 1.2× points on visits)
  - `has_priority_booking boolean`
  - `image_url text` (loyalty card art)
- Updated `membership_billing_public()` to expose all of these to customers (Stripe key still stripped via column projection).
- New `upsert_membership_billing(...)` RPC that the agency form calls — single round-trip save.
- Added `membership-images` storage bucket (public).
- Ends with `notify pgrst, 'reload schema'`.

**To apply:** Supabase SQL editor → New query → paste `01_roles_and_membership.sql` → Run. Safe to re-run.

### 2. Agency Brand Editor — single-membership form

`components/agency/membership-editor.tsx` was a multi-tier list (`business.tiers` array). It's now a single-membership form that reads from `business_membership_billing` and writes via `upsert_membership_billing`. Fields:

- Membership name + monthly price
- Loyalty-card image
- Monthly cash balance ($)
- Points multiplier (e.g. 1.2×)
- Priority booking toggle
- Perks list (free-text bullets)
- Visible-to-customers switch

Stripe credentials still live only on the **manager dashboard → Billing tab** so the surface area for the secret key stays minimal.

### 3. Customer side — Dermis benefit grid + signup polish

`components/customer/membership-section.tsx`:
- Members see a Dermis-style **benefit grid** (Cash balance, Member savings, Priority booking, Points multiplier — only the cards that apply for that business render).
- Non-members see the same dark exclusive card with new **value pills** above the perks list (cash balance, multiplier, priority booking) so the eye sees the money cues first.

`components/customer/membership-join-modal.tsx`:
- Same value pills appear on the final Stripe pre-checkout confirmation, so the customer sees concrete value at the moment of truth.
- Existing Stripe Checkout integration is unchanged — `handleSubscribe` → `/api/[slug]/membership/checkout` → Stripe → webhook → `upgrade_to_member` RPC.

### 4. Manager Dashboard — Billing + Insights hidden from front desk

`components/manager/manager-dashboard.tsx` now fetches `current_app_role()` on mount and filters the tab list. `business_staff` sees only `Front desk`, `Offers`, `News`. If a staffer somehow lands on `?tab=billing`, the dashboard bounces them back to `Front desk`. The actual data lockout is the RLS / RPC gating in part 1.

## Things to verify on the user end

1. Apply the SQL (it's required for the new membership fields and the role helpers).
2. Open Brand Editor → Membership and confirm the new single-membership form renders with your existing data preserved.
3. Open the customer app as a member and check the benefit grid renders only the cards you configured.
4. As a `business_staff` user on the manager dashboard, confirm Billing + Insights tabs are gone.
5. Click through a real Stripe Checkout to confirm the webhook still upgrades the tier.

## Known limits / queued for later

- `isPaid` detection on the customer side still uses the legacy `business.tiers` array (the Stripe webhook writes a tier name there on upgrade). When you're ready to fully retire the legacy `tiers` column, swap the check to "membership.tier matches billing.membership_name" — small change but out of scope for CP-22.
- The agency-side form does not yet edit Stripe credentials (intentional — those stay on the manager dashboard).
- Overall app-wide contrast / background-polish pass was scoped in but not done in CP-22; it can be CP-23.
