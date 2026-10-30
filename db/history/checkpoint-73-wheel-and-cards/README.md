# Checkpoint 73 — Wheel Visuals, Check-in-Synced Spins, No Tiers, Points-Card Styles

Four changes from Andrew's review.

## What changed

- **Images on the wheel** — reward wedges now show the prize's photo (a
  little round image right on the wedge); point wedges get a gold coin
  icon over the amount. The prize editor gained a "Prize photo" uploader
  (with the image library), so every prize can look like something worth
  winning.
- **Coupons removed** — a wheel prize is now points or a free reward,
  period. The coupon option is gone from the prize editor, existing
  coupon prizes are deactivated by the migration, and the spin +
  wheel-segment functions ignore them.
- **Spin synced with check-in (cooldown setting removed)** — the
  "Cooldown between spins" input is gone. The rule is now simply: check
  in today → one spin today. `spin_daily_reward` and
  `mystery_reward_status` were rewritten around calendar days instead of
  a configurable hours window, so the spin unlocks with every day's
  check-in and never blocks a freshly checked-in customer.
- **Bronze/Silver/Gold tiers removed** — from the Home points card
  ("points · Silver" → "points"), the 3D loyalty card on Rewards (tier
  badge → quiet MEMBER mark), the profile page ("Silver member" →
  "Member", Tier row → "Member since"), the scan page chip, and the
  builder's phone preview. (VIP paid membership is untouched — that's a
  different thing. The DB still computes tiers silently; nothing shows
  them.)
- **Points-card design presets** — the Home points strip now has 5 looks
  picked in the builder's design tab: Classic (white, default), Shiny
  (glossy brand gradient + light sweep), Fun (playful gradient +
  confetti dots), Sleek (dark glass + brand glow), Simple (flat, quiet).
  Live app + phone preview both wear it; the picker shows real mini
  swatches.

## SQL — run once in Supabase

`cp73_migration.sql` (SUPERSEDES cp72_wheel_segments.sql — if you haven't
run cp72 yet, skip it and run this instead):

- adds `businesses.points_card_style`
- deactivates coupon prizes
- `mystery_wheel_segments` v2 (+ image_url, no coupons)
- `mystery_reward_status` + `spin_daily_reward` v2 (check-in-day sync,
  no cooldown; demo bypass kept)

## Files

New: `lib/points-card-styles.ts`, `checkpoint-73-wheel-and-cards/cp73_migration.sql`
Changed: `components/customer/live-member-card.tsx`, `tilt-loyalty-card.tsx`,
`rewards-client.tsx`, `editable-profile.tsx`, `scan-client.tsx`,
`daily-mystery-modal.tsx`, `components/customer-preview/customer-preview.tsx`,
`components/agency/mystery-pool-manager.tsx`,
`components/brand-editor/brand-editor.tsx`, `lib/types/database.ts`,
`app/[business]/app/page.tsx`, `app/[business]/app/profile/page.tsx`.

Verified: full `tsc` = 0 errors + complete `next build` green in the cloud
mirror before shipping.

## Ship it

```bash
cd "C:/Users/andre/OneDrive/Documents/Claude/Projects/Atlas Engine APP"
git add checkpoint-73-wheel-and-cards "checkpoint-02-brand-engine/atlas-rewards-app"
git commit -m "CP-73: prize photos on wheel, check-in-synced spins, tiers removed, points-card style presets"
git push
```
