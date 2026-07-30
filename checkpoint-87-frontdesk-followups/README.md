# CP-87 — PIN hotfix, prize-only rewards, calmer notifications, qualified referrals

Follow-ups from Andrew's July 30 review of CP-86.

## 1. Front-desk PINs — actually fixed (SQL)
CP-86 restored the PIN functions, but saving a PIN then failed with
`function crypt(text, text) does not exist`. Cause: on Supabase, the
pgcrypto extension lives in the `extensions` schema, and the CP-49 RPCs
pinned `search_path = public` only — so `crypt()`/`gen_salt()` were
invisible. CP-87 recreates `set_front_desk_pin` and
`verify_front_desk_pin` with `search_path = public, extensions` (works
wherever pgcrypto is installed). Setting PINs AND keypad login both work
after this.

## 2. Admin app builder parity
- **Membership tab** now also carries the full **Payments, plans &
  passes** setup (CP-34 payment modes + CP-86 duration passes) — the
  exact component the manager dashboard uses.
- **Settings tab** now has the **Announcement** composer too.
- **Rewards tab** gains the referral-qualification setting (below).

## 3. Prize-only rewards (`show_in_store`)
A reward used only as a wheel prize / streak gift / offer gift no longer
has to be published to the customer reward store:
- New toggle in the reward editor: **"Show in rewards store"** (default
  on). Off = "🎡 Prize only" badge on the admin card.
- Customer store surfaces filter it out: Rewards tab, Shop page, Home
  "Top rewards" (`top_rewards_public`).
- Wheel / streak / offer pickers still list every active reward.
- "Reward unlocked" notifications ignore prize-only rewards.

## 4. One notification per award (not one per reward)
A big purchase that crossed several reward thresholds used to fire a
push per reward — 4-5 notifications at once. `/api/notifications/
award-event` now sends ONE: "You unlocked 3 rewards! 🎁 — You can now
redeem A, B, C at <business>."

## 5. Qualified referrals — no more link-farming
Referral points no longer pay out on signup. New flow:
- The referred friend signs up → referral goes **pending**.
- Every front-desk purchase accrues toward a configurable minimum spend
  (**default $20** — set per business in the app builder → Rewards →
  "Referral qualification"; $0 restores instant payout).
- When the friend crosses the line, **both** parties get their points
  automatically (events trigger → `complete_referral`) + a bell
  notification each.
- **Progress on both ends**: the referrer sees per-friend progress bars
  in the Refer-a-friend modal ("They've spent $12.50 of $20"); the
  referred friend sees a "Your +100 pt referral bonus is waiting — spend
  $7.50 more" progress card on Home (realtime).
- Threshold is snapshotted per referral, so changing the setting doesn't
  move goalposts mid-referral.
- Also fixed a latent CP-01 bug: the referrals table had a UNIQUE
  (business_id, code) index, so each member could only ever refer ONE
  person before hitting a duplicate-key error. Now non-unique.
- Re-asserts the CP-44.1 ledger fix (balance_after nullable + auto-fill
  trigger) since this DB missed it — win-back and referral credits both
  depend on it.

## Apply
1. Run `cp87_migration.sql` in the Supabase SQL editor (idempotent,
   self-contained, apply after cp86).
2. Deploy the app.

## Files
**SQL:** `checkpoint-87-frontdesk-followups/cp87_migration.sql`
**NEW:** `components/customer/referral-progress-card.tsx`
**MOD:** `components/agency/rewards-manager.tsx`,
`components/brand-editor/brand-editor.tsx`,
`components/customer/refer-friend-modal.tsx`, `lib/types/database.ts`,
`app/api/notifications/award-event/route.ts`,
`app/[business]/app/rewards/page.tsx`, `app/[business]/app/shop/page.tsx`,
`app/[business]/app/page.tsx`, `app/[business]/signup/page.tsx`

## Verified
Full cloud-mirror `tsc --noEmit`: **0 errors**.
