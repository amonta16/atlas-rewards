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
| Quick award Google / FB / IG (synced with builder) | `award-points-panel.tsx`: new "Review & follow rewards" row (Google review · Instagram follow · Facebook follow). Goes through the new `desk_award_social()` RPC — **once per member**: the tile turns green with the earned date, a second tap says "already awarded", and the customer's own app shows it as earned (same `reviews` row). If the customer already tapped "I followed" in the app (pending), the desk tap approves that row instead of duplicating. **Synced with the app builder:** Google tile shows only when the Reviews widget is on, at the "Google Review reward" points; IG / FB tiles show only when that platform's switch is ON under "Social follow rewards", at that platform's points box. Enforced server-side too (RPC raises "switched off in the app builder"). Flippo's today: Reviews on → Google 300; IG/FB not enabled yet → no tiles until switched on in the builder. The customer's Rewards tab flips to "✓ Done · Verified" in realtime (same `reviews` row) and the row stops being tappable. "Google Review" + "Social Follow" left the repeat-able Quick award grid. |
| Analytics repetitive | Insights tab used to stack `InsightsDashboard` **and** the full `BusinessInsights` (second "Atlas drove $X" hero, second members/revenue KPI row, second top-members list, member-health box). `BusinessInsights` gained `variant="embedded"` (period picker + 6 KPIs + revenue/visits charts only) and renders inside the dashboard's new `trends` slot, under the operations row. Agency analytics pages unchanged. |

## Booking v2 (no payments yet — by design)

New `booking_resources` (things with **capacity**: 6 cages, 4 sim bays, 1 party room) with
durations offered, party cap, per-weekday hours (or business hours), turnover buffer, lead time,
horizon, display-only price/deposit. `bookings` gains `resource_id, party_size, source,
amount_cents, deposit_cents, payment_status, payment_provider, payment_ref, paid_at, created_by`.
Capacity is enforced in the DB under a per-resource advisory lock.

* **Customer** — `/app/book` → `ResourceBooking` (what → how long → day/time grid with "N cages left" → party + note → done, plus "Your bookings" with cancel). Falls back to the CP-16/17 `BookFlow` for businesses still on tags/GHL. Home gets a `booking` module ("Book a batting cage…" card) — entertainment + medspa presets, only when booking is ON and a resource exists.
* **Builder** — new **Bookings** tab in the app builder (same `BookingResourceSetup` component as the desk's Set up, so agency and venue edit ONE list; the customer on/off switch publishes with Save).
* **Front desk** — new **Bookings** tab (managers always; staff when booking is on or the preset is entertainment/medspa): Today / Tomorrow / 7-day schedule with Confirm · Arrived · No-show · Cancel; **Walk-in / phone** form (attach the previous customer in one tap → confirmed immediately); managers get **Set up** (add cages/bays/rooms + the customer on/off switch = `widget_config.booking`).
* **Payments** — `lib/booking.ts` defines `BookingPaymentProvider` (`describe()` + `createIntent()` → none / redirect / client_secret) with `noPayment` wired. A Stripe/Square adapter later implements it and its webhook calls the service-role `set_booking_payment()` RPC, which flips `payment_status` and auto-confirms. No schema or UI change needed then.

## For Flippo's on Sunday
1. Run the SQL. 2. Deploy. 3. Manager → Bookings → Set up → add "Batting cage" (how many cages, 30 min / 1 hour, max party) → flip "Customers can book — ON". Until step 3 the desk can still take walk-ins by phone/at the counter through the same tab.

## Files
`lib/booking.ts` (new) · `lib/layout-presets.ts` · `app/[business]/app/page.tsx` · `app/[business]/app/book/page.tsx` · `components/customer/resource-booking.tsx` (new) · `components/customer/book-card.tsx` (new) · `components/manager/bookings-desk.tsx` (new) · `components/manager/booking-resource-setup.tsx` (new) · `components/brand-editor/brand-editor.tsx` · `components/manager/manager-dashboard.tsx` · `components/manager/award-points-panel.tsx` · `components/manager/insights-dashboard.tsx` · `components/agency/business-insights.tsx` · `components/frontdesk/front-desk-keypad.tsx`

Full cloud mirror: `tsc --noEmit` = 0 errors, `next build` green.

## CP-148 follow-up (Sep 24) — day sheet, needs-action badge, sidebar, photos
* **Bookings tab = DAY SHEET.** `booking-timesheet.tsx`: time down the left (opening→closing from resource/business hours, 30-min rows), one column per unit across the top (each "Batting Cage #N" is its own column; a resource with units=4 becomes Bay 1–4). Amber = needs confirm, green = confirmed, grey = done, faded red = cancelled/no-show, striped = closed, red line = now. Tap an empty cell → walk-in form pre-filled with that cage + time. Tap a block → action card (Confirm · Arrived · No-show · Cancel). ‹ › day arrows, Today, **Next week →** / ← This week.
* **Needs-action badge.** `lib/use-desk-actions.ts` polls (2 min + focus) pending review/IG/FB requests, pending booking requests, pending passes → bell + counts on the sidebar ("Needs action" card) and per-tab badges (Front desk / Bookings). Mobile header gets the bell too.
* **Left sidebar (lg+).** `manager-dashboard.tsx`: brand block → Needs action → Front desk (Front desk, Users, Bookings, Waivers) · Customer app (Offers, News, Membership) · Business (Insights, Billing, Team) → Install / Tutorial / Sign out. Below lg the original header + tab bar stay (with badges).
* **Photos.** Set up (desk + builder) has a Photo uploader per resource (`news-images/<biz>/booking`, written via RLS — no SQL change). Customer Book page shows photo-first cards, the confirm hero uses the photo, Home's Book card uses it as background; the walk-in form shows thumbnails. Emoji stays as the fallback.
* No new SQL.
