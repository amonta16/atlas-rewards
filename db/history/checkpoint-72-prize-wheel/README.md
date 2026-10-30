# Checkpoint 72 — Prize Wheel Only, Real Prizes On The Wheel

Three changes from Andrew's review: one game (the wheel) for every
business, real prize values on the wedges instead of emojis, and the
prize/odds configuration lives on the builder's Rewards tab.

## What changed

- **Wheel only** — the slot machine and mystery boxes games are gone.
  Every business plays the Prize Wheel ("spin is suitable for every
  business"). The game picker was removed from the builder; any legacy
  `reward_game` value (slot/boxes) silently resolves to the wheel. The
  demo-mode toggle stays where it was, in its own small section.
- **Real prizes on the wedges** — the wheel's 8 wedges now display the
  business's actual prize pool: point amounts as big numbers ("50 /
  PTS"), free rewards and coupons by name ("Free Latte / REWARD").
  Short pools repeat around the wheel. The wheel lands on the wedge
  matching whatever the server awarded (by prize id, falling back to
  point amount). Wheel emojis, the 🎯 hub (now the business logo, or a
  brand-colored bolt), the header 🎡, and the CTA emoji are all gone.
- **Odds configuration on the Rewards tab** — the Prize Wheel panel
  (revived MysteryPoolManager) now sits on the builder's Rewards tab
  under the rewards store: add prizes (points / free reward / coupon),
  set each prize's weight, and see the computed % odds live. Fixes along
  the way: the "Free reward" kind now has an actual dropdown of the
  business's rewards (before there was no way to pick one), the dead
  "enabled" switch was dropped (the wheel has been always-on since
  CP-44.1 — only the cooldown matters), and the empty state explains the
  default 50/100/300 wheel.

## SQL — run once in Supabase

`cp72_wheel_segments.sql` (after cp68) — adds
`mystery_wheel_segments(business_id)`: wedge labels ONLY (kind + name +
point amount). No weights, no odds, no coupon codes leak to customers —
the code is revealed only when won. Empty pool returns the default
50/100/300 so the wheel always matches what the spin can award.

Until this SQL runs, the wheel shows the default 50/100/300 wedges —
nothing breaks.

## Files

New: `checkpoint-72-prize-wheel/cp72_wheel_segments.sql`
Changed: `components/customer/daily-mystery-modal.tsx` (wheel-only rewrite),
`components/customer/daily-spin-button.tsx`, `components/agency/mystery-pool-manager.tsx`,
`components/brand-editor/brand-editor.tsx`, `lib/reward-games.ts`.

Verified: full `tsc` = 0 errors + complete `next build` green in the cloud
mirror before shipping.

## Ship it

```bash
cd "C:/Users/andre/OneDrive/Documents/Claude/Projects/Atlas Engine APP"
git add checkpoint-72-prize-wheel "checkpoint-02-brand-engine/atlas-rewards-app"
git commit -m "CP-72: Prize Wheel only — real prize wedges, odds config on Rewards tab"
git push
```
