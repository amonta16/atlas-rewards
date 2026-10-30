# Checkpoint 34 — Membership payment modes

Andrew's call: local business owners (salons, gyms, cafes, dental) use
wildly different payment stacks. Forcing every owner to set up Stripe
Connect is the wrong battle. CP-34 gives each business three ways to
collect membership payments, and they pick whichever fits.

## What Andrew asked for, in his words

> One last thing about the memberships for the business owners, do we
> want them deal with stripe API keys, a lot of these different business
> owners use different payment processors and getting them set up with
> one in our case would be a hassle. Whats a better way for them to
> collect their membership earnings? third party widget, or give them
> freedom to set that up on their own and also track here?

## What CP-34 ships

### Three payment modes per business

1. **`in_person`** *(new default)* — Customer signs up in the Atlas app
   → membership goes to `pending` → staff confirms payment at the front
   desk (cash, POS card, Venmo, whatever) → taps "Activate" → done.
2. **`external_link`** — Owner pastes any payment URL (Square invoice,
   PayPal subscribe, Shopify checkout, Calendly with payment, anything).
   Customer taps "Join" → request marked pending + payment URL opens in
   new tab → staff confirms payment → activates.
3. **`stripe`** *(legacy / power users)* — The existing CP-23 Stripe
   Checkout flow. Owner pastes their Stripe secret key + webhook secret;
   payments + activations happen automatically.

### Database changes (`cp34_migration.sql`)

- `business_membership_billing` extended with:
  - `payment_mode` text — `'stripe' | 'external_link' | 'in_person'`,
    default `'in_person'`
  - `external_payment_url` text
  - `payment_instructions` text — optional copy shown to the customer
- `business_memberships.status` check constraint widened to allow
  `'pending'`
- `business_memberships.membership_payment_status` text — `'paid' |
  'pending' | 'unpaid'`
- Backfill: businesses with a `stripe_secret_key` already set get
  defaulted to `payment_mode = 'stripe'` so nothing breaks for existing
  setups.

### RPCs

- `membership_billing_public(business_id)` — refreshed return shape;
  now exposes `payment_mode`, `external_payment_url`,
  `payment_instructions` to the customer client.
- `upsert_membership_billing_v2(...)` — extended agency-side upsert
  that takes the new payment-mode fields (kept the original
  `upsert_membership_billing` untouched for legacy callers).
- `request_membership(business_id)` — customer-side: marks the
  caller's membership row as pending and returns
  `(status, payment_mode, payment_url)` so the client can branch.
  Refuses if `payment_mode = 'stripe'` and redirects to the existing
  checkout API.
- `list_pending_memberships(business_id)` — staff-side: returns
  customers awaiting activation, with name / email / phone /
  requested_at.
- `activate_pending_membership(membership_id, note?)` — staff-side:
  flips status to active + payment_status to paid + drops a "You're a
  member!" in-app notification to the customer.
- `reject_pending_membership(membership_id)` — staff-side: drops the
  request entirely.

### UI changes

- **`components/manager/membership-billing-setup.tsx`** — three
  mode-cards at the top of the panel ("At the front desk" /
  "External payment link" / "Stripe (auto)"). Picker drives which
  fields show below. The original Stripe section is now gated behind
  `payment_mode === "stripe"`. New status pill ("In-person ready" /
  "Payment link set" / "Stripe connected") replaces the
  Stripe-only "Not connected" warning.
- **`components/customer/membership-join-modal.tsx`** —
  `handleSubscribe` branches on `payment_mode`:
  - `stripe` → existing `/api/<slug>/membership/checkout` flow
  - `external_link` → call `request_membership` RPC + `window.open`
    the payment URL in a new tab
  - `in_person` → call `request_membership` RPC + show "pending"
    success state
  CTA button copy + footer fine-print update per mode. A new "Pending
  activation" success screen with optional payment instructions shows
  after a non-Stripe request.
- **`components/manager/pending-memberships-queue.tsx`** — **new**.
  Front-desk widget listing every pending membership for this business
  with Reject + Activate buttons. Live-updates via Supabase Realtime.
  Self-hides when empty. Wired into the Front-desk tab beneath
  ReviewQueue.

### What didn't change

- Existing Stripe flow (`/api/<slug>/membership/checkout` +
  `/api/<slug>/membership/webhook`) is untouched — businesses already
  on Stripe keep working.
- The original `upsert_membership_billing` RPC is preserved so any
  legacy callers don't break.
- No changes to the streak / points / reward systems — CP-34 is
  scoped to membership payment flow only.

## How to deploy

1. Apply `cp34_migration.sql` in the Supabase SQL editor (after CP-32).
2. Push the UI changes + redeploy on Vercel.
3. In each business's Membership panel, pick a payment mode and save.
   - "At the front desk" is the new safe default and requires zero
     setup.

## What CP-34 deliberately does NOT do

- **Stripe Connect onboarding** — the path where Atlas processes
  payments on behalf of each business and takes a cut. That's a CP-50+
  decision once Atlas has 100+ businesses and some explicitly ask for
  it.
- **Auto-confirm via Square / PayPal / Shopify webhook** — would
  require per-processor adapters. Manual front-desk confirmation
  covers 95% of use cases at the in-person-pitch stage.
- **Recurring billing for non-Stripe modes** — the customer's
  membership is active until staff manually flips it back. A
  scheduled "expire after 30 days" job is a future addition once
  Andrew sees the actual usage pattern.
