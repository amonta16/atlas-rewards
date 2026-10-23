# CP-214 · Complete example clinic: gift, in-app booking, membership, example checkout

**Check after push:** builder → a med spa → **Load example clinic**, then in the customer app:
- Home → the gift
- Book (from Home or a treatment) → pick a time → Request
- Shop → a package → Checkout → Klarna → Place order
- Shop → Membership

## Why the gift didn't show
The example gift only showed on `is_demo` apps. "lotus-medspa" was created from the agency New business form with Demo unticked, so it was off.
- Now any app filled with the example clinic is an **example app** (`medspa_config.example = true`, see `isExampleApp()` in `lib/medspa.ts`).
- Example apps always show the gift, the same as demos.
- I already marked lotus-medspa as example in the database.

## Booking (Dermis-style, in-app)
**Before:** Book on a med spa with Atlas booking on fell through to the venue picker ("Pick a service · Other").

**Now:** `components/medspa-app/book-flow.tsx` runs the booking for med spas.
- **Flow:** pick a treatment (with photo, length, price), choose who with ("Anyone available" or a provider), pick a day from the next 3 weeks (closed days greyed out), pick a time, add an optional note, then Request.
- **Times:** they come from the practice's booking hours, minus anything already booked. The taken times come from a new RPC, `booking_busy_times`, which returns start/end only and no patient details. It's already applied to production (`cp214_booking_busy_times.sql`).
- **Where requests go:** each request becomes a pending booking (`create_booking`) in the front desk's Bookings tab. The treatment and provider are in the booking notes.
- **Scheduling links still win:** a treatment that has its own scheduling link still opens that page. If booking is off, it falls back to call / text.
- **The example clinic now sets:** Mon–Fri 9–6 (Thu to 7), Sat 10–4, 30-minute slots, and Atlas booking on.

## Membership
**The example clinic now creates:**
- **Membership:** "Prevent & Protect", $150/mo, from the Dermis template.
- **Perks:**
  - a monthly facial
  - $150 banked each month toward treatments
  - member pricing
  - 5% off skincare
  - 2× points
  - priority booking
- **Payment:** pay at the desk.

The Dermis template has **three tiers** (Prevent & Protect $150, Correct & Maintain $250, Refine & Enhance $380). Our membership model holds one plan plus one-time passes, so the other two tiers need a model change: tiers, a Stripe price per tier, and the webhook mapping. That's proposed as the next step.

## Example checkout (Klarna / Affirm / card)
**Why Klarna didn't show:** online payment only appears when the practice has a live Stripe Connect account. Demos don't have one.

**Now:** on example and demo apps, Shop checkout shows the full payment screen (Card, Apple Pay / Google Pay, Klarna, Affirm).
- Place order goes to a **simulated** approval, for example "4 interest-free payments of $X with Klarna".
- No Stripe call is made and no order is saved. The screen says plainly that it's an example.
- Real practices are unchanged: Stripe Checkout runs on their own connected account, and Klarna / Affirm must be on in their Stripe dashboard.

## Verified
- `tsc` 0 errors and `next build` green.
- Booking flow checked in Playwright at 390 px. No console errors.
- Not clicked through with a real patient login: the checkout demo screen and the membership tab.
