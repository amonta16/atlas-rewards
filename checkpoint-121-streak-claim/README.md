# CP-121 — Tap-to-claim streak gifts + state-aware Streaks badges

## Apply order

1. **Supabase → SQL Editor: run `cp121_migration.sql`** (after cp120).
2. **Deploy the app** (git push).

Apply both together. Until the SQL runs, milestone check-ins keep paying
out the old instant way — nothing breaks, the claim UI just has nothing
to show.

## What changed

**Milestone prizes are now GIFTS you unwrap.** Hitting a streak milestone
no longer silently drops points on the balance. It earns a gift that sits
on the streak roadmap glowing gold — "🎁 TAP TO CLAIM" — until the member
taps it. Tapping plays the unwrap moment:

- **Points gifts** → points land on the balance right there (+N reveal).
- **Reward gifts** → a real prize card with a **desk code** (a zero-cost
  pending redemption, 30-day validity) — the front desk fulfills it through
  the same code box as any redemption. This also fixes a quiet gap: reward-
  type milestones previously had no delivery mechanism at all.

Gifts survive **7 days** — even if the streak breaks — then expire
(Andrew's call). Mystery-spin milestones keep their existing spin flow.
Milestones already paid out before this migration stay paid; no double pay.

**Streaks tab badges now tell the truth about state:**

- 🟡 **Gold gift badge** — an unclaimed gift is waiting (server truth;
  clears the moment it's claimed).
- 🟡+🔴 **Gold gift with a red ring**, wobbling fast — gift waiting AND
  the streak is about to expire.
- 🔴 **Red "!"** — streak about to expire (streak alive, not checked in,
  under 25% of the period / max 24h left), or streak moved since they
  last looked (CP-120 behavior).
- Nothing while the Streaks tab itself is open.

**Front desk:** the check-in success card now adds "🎁 Their gift is
waiting on the Streaks page — tell them to open the app and tap it!" so
staff can turn every milestone into an app-open moment.

## Files changed

- `checkpoint-121-streak-claim/cp121_migration.sql` — member_streak_gifts
  table (RLS on, RPC-only), member_checkin v3 (earn-not-pay),
  claim_streak_gift, list_streak_gifts
- `components/customer/streaks-client.tsx` — claimable milestone cards,
  claim overlay (unwrap moment), gifts wiring
- `components/customer/app-shell.tsx` — state-aware badge system
- `components/manager/award-points-panel.tsx` — desk success copy

## Verified

- SQL on scratch Postgres (citext + real constraints): milestone check-in
  earns a gift with balance unchanged → stranger blocked from claiming →
  member claim credits +50 → double-claim blocked → day-2 reward milestone
  → claim mints code `R6EQ76L` → **the CP-118 desk resolver finds it as a
  pending redemption**. Transactional, re-runnable.
- App: full cloud-mirror `tsc --noEmit` — **0 errors** (staged copies
  md5-verified against the device before checking).

## Notes

- The nav badge polls once per tab navigation (same pattern as the review
  badge) — a claim reflects on the badge on the next screen change.
- Expired unclaimed gifts simply render as a normal earned milestone; the
  streak page never shows a dead "claim" button.
