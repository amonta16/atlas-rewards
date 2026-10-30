# Checkpoint 28 — UI polish + birthday lock + points-only

UI + SQL.

## What Andrew asked for

1. Make the quick-action pills a bit smaller.
2. Re-add a distinctive stripe pattern to the custom-offer header.
3. Lock the birthday after it's set so customers can't game the +250
   birthday bonus by editing the date repeatedly.
4. Make the "Need more points?" section feel more alive while staying
   on-brand.
5. Remove cash reward — Atlas is points-only.

(The admin/manager/front-desk tab overhaul + backend hardening for
launch is scoped for CP-29 / CP-30 / CP-31 — see "What's next" below.)

## What CP-28 ships

### 1. Smaller pill quick-actions (further shrink past CP-27)

`components/customer/header-actions.tsx`:

| Token         | CP-27 (was) | CP-28 (now) |
|---------------|-------------|-------------|
| Pill height   | `h-8` (32px)| `h-7` (28px)|
| Padding       | `pl-1.5 pr-2.5` | `pl-1.5 pr-2` |
| Gap between   | `gap-2`     | `gap-1.5`   |
| Icon size     | 15px        | 13px        |
| Label text    | 11px        | 10px        |
| Lock badge    | 14×14       | 12×12       |
| Pulse dot     | 10×10       | 8×8         |
| Count bubble  | 18×18       | 16×16       |

All three pills (Check-in / Member / Streak) shrink together so the
header reads as one tidy chip-row at any phone width.

### 2. Distinctive stripe pattern on the featured-offer header

`components/customer/featured-offer-banner.tsx` and the matching
preview in `components/customer-preview/customer-preview.tsx`:

- Live banner gains a 45° `repeating-linear-gradient` overlay
  (`rgba(255,255,255,0.10)` 0–8px, transparent 8–18px) on top of the
  brand primary background, so the bar reads as a *promo* band, not a
  flat color strip.
- Title and tag icon get a subtle `drop-shadow-sm` so they stay legible
  over the texture.
- The agency-preview banner shows a *denser* version of the same stripe
  when no real featured offer exists yet, so the agency can tell at a
  glance "this is a placeholder, not a live offer."

### 3. Birthday set-once lock (UI + DB)

#### UI

`components/customer/editable-profile.tsx`:

- When the customer already has a `date_of_birth` on file, the edit
  view renders a locked card instead of a date input: padlock badge,
  the saved date, and a short explainer:
  > "Birthday is set once to keep the +250 bonus fair. Ask the front
  > desk if it needs to be corrected."
- When the field is still empty, the input is shown with an amber
  "Heads up — this can only be set once" caption so users don't slip
  in a wrong date thinking they can fix it later.
- The save handler nulls out the birthday param when locked so the RPC
  isn't even called with an attempt to overwrite.

#### Database (defense-in-depth)

`cp28_migration.sql` adds two backstops:

1. `enforce_birthday_set_once` trigger on `public.customers` —
   `BEFORE UPDATE OF date_of_birth`. If `OLD.date_of_birth IS NOT NULL`
   and the row tries to change it, the trigger silently restores the
   original value. No error to the client — the write just doesn't
   happen.
2. `update_my_profile(p_full_name, p_phone, p_birthday)` is rewritten
   to read the existing DOB first and only set it when the row has no
   DOB on file. Even a hand-crafted RPC call with a fresh DOB cannot
   overwrite an existing one.

This means the loophole is sealed in three layers: client UI, RPC
function, and table trigger.

### 4. "Need more points?" — livelier section

`components/customer/rewards-client.tsx` + customer-preview mirror:

- Section header now carries a small brand-gradient "Earn" badge.
- Each `EarnRow` rebuilt:
  - Card background switched from flat white to a soft brand-tinted
    linear gradient (`primary08 → secondary05`), with a `primary22`
    border so the rows feel like one cohesive "earn zone."
  - Icon tile is now a **gradient pill** (was a flat `${color}15`
    swatch) with white icon, rounded-xl shape, and a `primary40`
    glow shadow.
  - The "+N Points" pill button gets the same gradient + ring +
    `primary55` glow so it pops as an action target.
  - Hover/tap micro-interaction: `hover:-translate-y-0.5` lift +
    `active:scale-[0.99]` press. Wired only for the actionable
    variants (refer / review) so non-actionable rows don't pretend
    to be tappable.
- Birthday subtitle clarified to "Auto-awarded once a year on your
  birthday" so it reinforces the once-a-year rhythm.

### 5. Cash reward removed product-wide

Atlas is points-only as of CP-28. Files touched:

- `components/customer/tilt-loyalty-card.tsx` — `cashLabel` and
  `cashValue` props dropped; the right-side `{Name} Cash $0` slot is
  replaced with a tier badge so the card stays visually balanced.
- `components/customer/rewards-client.tsx` — no longer passes
  `cashLabel` / `cashValue`.
- `components/customer-preview/customer-preview.tsx` — mirror update
  on the rewards card (Tier replaces Cash); the "$ Cash credit" pill
  is removed from the membership preview tile and replaced with
  "VIP perks".
- `components/customer/membership-section.tsx` — `monthly_cash_balance_cents`
  removed from `BillingPublic`; cash-credit perks bullet, cash
  `ValuePill`, and the `Wallet` `BenefitCard` are all stripped.
- `components/customer/membership-join-modal.tsx` — cash credit
  `ModalPill` removed; `monthly_cash_balance_cents` removed from
  `BillingPublic`.
- `components/agency/membership-editor.tsx` — "Monthly cash balance
  credited to member" form field removed; `monthly_cash_balance_cents`
  removed from `MembershipForm`; the save call hard-codes
  `p_monthly_cash_balance_cents: 0`.
- `cp28_migration.sql`:
  - One-time `UPDATE` zeroes every existing `monthly_cash_balance_cents`.
  - `enforce_no_cash_credit` trigger coerces any future non-zero write
    back to 0 so the perk can never accidentally come back.

The `monthly_cash_balance_cents` column stays in the schema so the
existing `upsert_membership_billing` RPC signature doesn't have to
change — the value is just permanently 0. A future migration can
drop the column once we're sure nothing reads it.

## Files touched

```
components/customer/header-actions.tsx
components/customer/featured-offer-banner.tsx
components/customer/editable-profile.tsx
components/customer/rewards-client.tsx
components/customer/tilt-loyalty-card.tsx
components/customer/membership-section.tsx
components/customer/membership-join-modal.tsx
components/customer-preview/customer-preview.tsx
components/agency/membership-editor.tsx
checkpoint-28-cp28-ui-polish-and-points-only/cp28_migration.sql
```

## SQL to run

Open Supabase → SQL editor → paste `cp28_migration.sql` → Run.
Self-contained, idempotent, safe to re-run on the same database.

Verify after running:

```sql
-- 1) Birthday lock trigger present
SELECT tgname FROM pg_trigger WHERE tgname = 'trg_enforce_birthday_set_once';

-- 2) update_my_profile is SECURITY DEFINER
SELECT prosecdef FROM pg_proc WHERE proname = 'update_my_profile';

-- 3) No row has a non-zero cash balance
SELECT business_id, monthly_cash_balance_cents
FROM public.business_membership_billing
WHERE monthly_cash_balance_cents IS DISTINCT FROM 0;
```

(All three should look right: trigger row returned, `prosecdef = true`,
and the third query should return zero rows.)

## What's next

The bigger asks ("improve admin/manager/front-desk tabs" +
"backend 100% solidified for launch") are split across the next
checkpoints — picked because each is a self-contained ship and Andrew
prefers one checkpoint at a time:

- **CP-29 — Admin tab agency-wide controls.** Per-sub-account toggles
  surfaced in one place, agency MRR view, all-clients leaderboard,
  plan/seat management.
- **CP-30 — Manager tab day-to-day ops.** Faster customer lookup,
  bulk point adjustments, offer scheduling, staff PIN management,
  daily/weekly recap.
- **CP-31 — Backend launch hardening.** Bundle the unapplied CP-03
  SQL + every hotfix since (CP-21, 22, 23, 25, 26, 28) into one clean
  idempotent migration; full RLS audit on every table; wrap every
  RPC/insert with try/catch + toast + loading + empty states; add
  UNIQUE / FK / trigger guards against duplicates and orphans.

Front-desk has a smaller polish pass that will land alongside CP-30.
