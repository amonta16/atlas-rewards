# CP-147 · Front-desk launch touches (Flippo's, Sun Sep 27 2026) + Booking v2

**Apply `cp147_desk_and_booking.sql` in the Supabase SQL editor BEFORE deploying.**
Idempotent — safe to re-run. Scratch-tested on PG16 (12 cases: dup guard, pending→verified
approve, non-staff rejection, capacity 2/2 → 3rd fails, turnover buffer, party cap,
custom vs business hours, customer cancel frees the unit, payment hook).

## Front desk

| Ask | What changed |
|---|---|
| Sign out → email/password dead end | `manager-dashboard.tsx` `signOut()`: a `business_staff` (PIN) session now lands on `/<slug>/frontdesk` (the keypad). Managers land on `/login?staff=1`. |
| Separate manager login | `front-desk-keypad.tsx`: "Manager? Sign in with email" pill under the keypad → `/<slug>/login?staff=1` (base-aware for the subdomain form). |
| Phone lookup | Was already there (CP-130) and *also* accepts the old member / redemption codes — that's by design, both keep working. The box is now **open by default** on the desk tab, clears + reopens after every customer, and the hint says phone first. |
| Quick award Google / FB / IG | `award-points-panel.tsx`: new "Review & follow rewards" row (Google review · Instagram follow · Facebook follow). Goes through the new `desk_award_social()` RPC — **once per member**: the tile turns green with the earned date, a second tap says "already awarded", and the customer's own app shows it as earned (same `reviews` row). If the customer already tapped "I followed" in the app (pending), the desk tap approves that row instead of duplicating. Points = `social_config[platform].points` → `point_rules.social_follow` (Flippo's: 50) / `point_rules.review` (300). "Google Review" + "Social Follow" left the repeat-able Quick award grid. |
| Analytics repetitive | Insights tab used to stack `InsightsDashboard` **and** the full `BusinessInsights` (second "Atlas drove $X" hero, second members/revenue KPI row, second top-members list, member-health box). `BusinessInsights` gained `variant="embedded"` (period picker + 6 KPIs + revenue/visits charts only) and renders inside the dashboard's new `trends` slot, under the operations row. Agency analytics pages unchanged. |

## Booking v2 (no payments yet — by design)

New `booking_resources` (things with **capacity**: 6 cages, 4 sim bays, 1 party room) with
durations offered, party cap, per-weekday hours (or business hours), turnover buffer, lead time,
horizon, display-only price/deposit. `bookings` gains `resource_id, party_size, source,
amount_cents, deposit_cents, payment_status, payment_provider, payment_ref, paid_at, created_by`.
Capacity is enforced in the DB under a per-resource advisory lock.

* **Customer** — `/app/book` → `ResourceBooking` (what → how long → day/time grid with "N cages left" → party + note → done, plus "Your bookings" with cancel). Falls back to the CP-16/17 `BookFlow` for businesses still on tags/GHL. Home gets a `booking` module ("Book a batting cage…" card) — entertainment + medspa presets, only when booking is ON and a resource exists.
* **Front desk** — new **Bookings** tab (managers always; staff when booking is on or the preset is entertainment/medspa): Today / Tomorrow / 7-day schedule with Confirm · Arrived · No-show · Cancel; **Walk-in / phone** form (attach the previous customer in one tap → confirmed immediately); managers get **Set up** (add cages/bays/rooms + the customer on/off switch = `widget_config.booking`).
* **Payments** — `lib/booking.ts` defines `BookingPaymentProvider` (`describe()` + `createIntent()` → none / redirect / client_secret) with `noPayment` wired. A Stripe/Square adapter later implements it and its webhook calls the service-role `set_booking_payment()` RPC, which flips `payment_status` and auto-confirms. No schema or UI change needed then.

## For Flippo's on Sunday
1. Run the SQL. 2. Deploy. 3. Manager → Bookings → Set up → add "Batting cage" (how many cages, 30 min / 1 hour, max party) → flip "Customers can book — ON". Until step 3 the desk can still take walk-ins by phone/at the counter through the same tab.

## Files
`lib/booking.ts` (new) · `lib/layout-presets.ts` · `app/[business]/app/page.tsx` · `app/[business]/app/book/page.tsx` · `components/customer/resource-booking.tsx` (new) · `components/customer/book-card.tsx` (new) · `components/manager/bookings-desk.tsx` (new) · `components/manager/manager-dashboard.tsx` · `components/manager/award-points-panel.tsx` · `components/manager/insights-dashboard.tsx` · `components/agency/business-insights.tsx` · `components/frontdesk/front-desk-keypad.tsx`

Full cloud mirror: `tsc --noEmit` = 0 errors, `next build` green.
