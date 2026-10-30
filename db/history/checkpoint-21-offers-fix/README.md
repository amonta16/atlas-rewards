# Checkpoint 21 — Offers fix + UI parity

Small, paste-able SQL fix that unblocks **Save offer** in the agency / manager UI,
plus an agency-side UI pass that mirrors the One-Time / Automated tab split
already used on the Manager Dashboard, and a sticky featured-offer banner that
follows the customer across every tab (not just Home).

## 1. The "Save offer" error

> Could not find the function public.upsert_offer(p_business_id, p_description,
> p_expires_at, p_id, p_image_url, p_is_active, p_is_featured, p_title) in the
> schema cache.

This appears when you click **Save offer** on a custom offer. It does **not** mean
something is broken in the code — it means the SQL function `upsert_offer` is
not currently registered with this Supabase project's PostgREST API. Either the
CP-20 migration was never applied, or PostgREST's schema cache went stale.

### How to fix it

1. Open the [Supabase SQL editor](https://app.supabase.com/) for your project.
2. New query → paste the entire contents of [`01_upsert_offer.sql`](./01_upsert_offer.sql).
3. Run.
4. Reload the Atlas tab in your browser and click **Save offer** again. It will work.

The file is idempotent — safe to run repeatedly. It drops + recreates
`upsert_offer` and `delete_offer`, makes sure the `offers` table and RLS policies
are in place, and ends with `notify pgrst, 'reload schema'` so PostgREST picks
up the new definition immediately.

## 2. Agency Brand Editor — One-Time / Automated tab split

The Manager Dashboard (`components/manager/manager-dashboard.tsx`) already shows
custom and automated offers under a segmented pill control. The agency-side
Brand Editor (`components/brand-editor/brand-editor.tsx`) was stacking both
managers vertically. CP-21 lifts the same segmented control onto the agency
side so the editing experience matches the screenshot Andrew shared (Dermis
"One-Time offers | Automated Offers").

No new components. The change is contained in `brand-editor.tsx`.

## 3. Sticky featured-offer banner — every tab

The blue "Free hotdog with $2… · Expires in 8 days" banner used to live only
on the Home tab (`app/[business]/app/page.tsx`). CP-21 moves it into the
customer app shell so it persists across Home / Shop / Scan / Rewards /
Profile — the "above everything" placement Andrew asked for. Hidden when no
featured offer exists or when the offer is expired.

## Next checkpoint — CP-22 (queued)

CP-22 will do the bigger lift Andrew asked for: collapse the multi-tier
membership editor to a single membership, add the Dermis-style benefit grid
(Savings / Priority booking / Points multiplier / Free treatments) on the
customer Shop tab, gate Billing + Insights tabs to `business_manager` /
`agency_admin` only, and do an overall polish pass on contrast and subtle
backgrounds.
