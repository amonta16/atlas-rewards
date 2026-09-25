# CP-151 · Membership rebuilt from scratch (both sides) — no SQL

## Root cause of "can't update the passes"
The builder's Membership tab stacked TWO editors on the same `business_membership_billing` row: `MembershipEditor` (CP-22, saves via `upsert_membership_billing` v1 — no `pass_options`/`offer_monthly`) above `MembershipBillingSetup`. Saving the top one wiped what the bottom one saved. Flippo's row was still placeholder data (perks "Perk 1–4", monthly off, no passes, disabled) → nothing rendered for customers.

## Now
* **`components/manager/membership-studio.tsx`** — the ONE editor, used by the manager portal's Membership tab AND the builder's Membership/Passes tab. Numbered steps: 1 name + photo · 2 perks (list, points multiplier, priority booking) · 3 monthly + passes · 4 payment (front desk / your link / **Stripe Connect** card) · Live switch with blockers. Right side (lg+): a phone-framed **live preview rendered by the exact customer card**, fed from the unsaved draft. Save → `upsert_membership_billing_v3` (coerces "on but unsellable" to off).
* **`components/customer/membership-hub.tsx`** — customer side, no modal. Prospect: hero (photo or brand gradient), name, perks, inline plan picker (only when >1 offer), one CTA whose label follows the payment mode ("Join · $29.99/mo" / "Buy pass · $199" / "Continue to payment" / "Reserve at the front desk"), fine print. Pending: reads `business_memberships.membership_payment_status` so it survives reloads; shows the chosen plan + what happens next (+ "Finish payment" for links). Member: MEMBER card with plan, since, renews/expires, points, perks + `ManageMembership` (Stripe). Refreshes on focus.
* Mounted on Home (`membership` module) and `/app/membership`. Exports `MembershipOfferCard` for the studio preview.
* **Deleted:** `membership-section.tsx`, `membership-join-modal.tsx`, `membership-billing-setup.tsx`, `agency/membership-editor.tsx`.

Data layer unchanged (`lib/membership.ts` model, `membership_billing_public`, `request_membership_v2`, `member_membership_status`). tsc 0 · next build green · card rendered for monthly+passes / passes-only / monthly-only.

## Flippo's on Sunday
Manager → Membership: name it, add 3–4 real perks, set a monthly price and/or a pass, pick **Front desk**, flip Live, Save. Customers see it on Home and the Pass tab immediately; requests land in the desk's pending queue + the Needs-action badge.
