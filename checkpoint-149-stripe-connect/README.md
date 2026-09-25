# CP-149 · Stripe Connect foundation — memberships paid through Atlas

**Run `cp149_stripe_connect.sql` in the Supabase SQL editor, set the env vars below, register the ONE webhook, then deploy.** Nothing changes for businesses on `in_person` / `external_link`; a business on `stripe` mode with a legacy pasted key keeps working until it clicks Connect.

## Why

CP-23/34's `stripe` mode stored each business's **raw secret key** and a per-business webhook secret in `business_membership_billing`, required the owner to create a webhook in the Stripe dashboard, and never tracked the customer / subscription / renewals / failures. CP-149 makes Atlas a **Stripe Connect platform**: each business owns a **Standard connected account** (their money, dashboard, KYC, disputes); Atlas stores only the `acct_…` id and capability flags. Checkout, subscriptions and customers live on the connected account via the `Stripe-Account` header using Atlas's single platform key. One Connect webhook serves every business.

## One-time Atlas setup (platform account)

1. **Enable Connect** — dashboard.stripe.com → Settings → Connect → Get started → platform profile (Atlas = software platform, US, "customers of my users"). Standard accounts need no Stripe review.
2. **Branding** (Settings → Connect → Branding) — Atlas logo/color show on the connected-account onboarding page.
3. **Env vars** (Vercel → Project → Settings → Environment Variables, Production + Preview):

   | Name | Value |
   |---|---|
   | `STRIPE_SECRET_KEY` | Atlas platform secret key (`sk_live_…`; use `sk_test_…` on Preview) |
   | `STRIPE_CONNECT_WEBHOOK_SECRET` | signing secret from step 4 |
   | `STRIPE_PLATFORM_FEE_PERCENT` | optional, e.g. `2.5`; unset = no platform fee |

4. **Webhook** — Developers → Webhooks → Add endpoint → URL `https://www.atlas-engine.app/api/stripe/connect/webhook` → **select "Listen to events on Connected accounts"** (not "your account") → events: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`, `account.updated` → copy the `whsec_…` into `STRIPE_CONNECT_WEBHOOK_SECRET`. (The existing `/api/stripe/webhook` for Atlas's own agency billing is unchanged.)
5. **Customer portal** — Settings → Billing → Customer portal → turn on; allow "cancel subscriptions" (at period end) and "update payment method". Portal sessions are created on the connected account, and Standard accounts inherit a default configuration, so this is a one-liner check, not per-business work.
6. Test mode first: with `sk_test_…` the same flow creates test connected accounts; use card `4242 4242 4242 4242`.

## What each business does

Builder → Membership → *How they pay you* → **Stripe (automatic)** → **Connect with Stripe**. Stripe's hosted onboarding (≈10 min): business details, ID check, bank account for payouts. They return to the builder with `?stripe=connected`; the card shows Details ✓ / Charges ✓ / Payouts ✓. That's it — no keys, no webhooks. Atlas sees only those flags.

## What ships

**SQL** — `business_payment_accounts` (no secrets; managers read own row), `membership_subscriptions` (provider ids, plan, status, period end, cancel flag), `membership_payments` (ledger), `payment_events` (idempotency), `apply_membership_event()` (service-role state machine; also projects onto the `business_memberships` columns the app already reads), `payment_account_public()`, `my_membership_subscription()`, `member_subscription_status()`. Scratch-tested: checkout → renew → fail → cancel-at-end → deleted, duplicate event, pass purchase.

**Server** — `lib/payments/stripe.ts` (fetch-based platform client: accounts, account links, checkout on connected account, portal, cancel, signature verify), `lib/payments/accounts.ts`; routes `POST /api/stripe/connect/onboard`, `GET /api/stripe/connect/return`, `POST /api/stripe/connect/webhook`, `POST /api/[business]/membership/manage` (portal / cancel / resume); `POST /api/[business]/membership/checkout` now prefers the connected account (legacy key path kept, marked for removal).

**UI** — `StripeConnectCard` inside `MembershipBillingSetup` (desk + builder) replaces the key fields; legacy key fields appear only while an old key is on file. Customer `ManageMembership` under the paid card: update card & receipts (portal), cancel at end of period, keep membership; passes show expiry only. `membershipBlockers()` now keys off "Charges enabled" instead of a pasted key.

## Money & status rules

- Monthly = Stripe subscription (Stripe bills renewals; Smart Retries on failure). Pass = one-time payment with hard expiry; a Stripe Customer is always created so receipts/portal work.
- `invoice.paid` extends access to period end + 3-day grace; `invoice.payment_failed` → `past_due` (member keeps access through grace, app shows "update your card"); cancel = at period end, member keeps what they paid for; `subscription.deleted` → lapses at period end.
- Prices come only from `business_membership_billing` server-side and are stamped into Stripe metadata; the webhook trusts metadata we wrote, never the client.
- Optional platform fee: `application_fee_percent` on subscriptions / `application_fee_amount` on passes when `STRIPE_PLATFORM_FEE_PERCENT` is set.

## Not in this phase (next)

Receipt/failed-payment push notifications, refunds from the desk, plan changes with proration, nightly reconciliation cron, desk VIP strip reading `member_subscription_status`, deleting the legacy key columns, Square/Clover adapters behind the same `apply_membership_event()`.

## Files
`cp149_stripe_connect.sql` · `lib/payments/stripe.ts` (new) · `lib/payments/accounts.ts` (new) · `lib/membership.ts` · `app/api/stripe/connect/{onboard,return,webhook}/route.ts` (new) · `app/api/[business]/membership/manage/route.ts` (new) · `app/api/[business]/membership/checkout/route.ts` · `components/manager/stripe-connect-card.tsx` (new) · `components/manager/membership-billing-setup.tsx` · `components/customer/manage-membership.tsx` (new) · `components/customer/membership-section.tsx`
