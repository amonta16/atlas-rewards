# Checkpoint 70 — Streak Cube Tray

Two changes from Andrew's review. No SQL — deploy and done.

## What changed

- **Spin/Streak removed from the Rewards tab** — the Daily Spin card and
  the streak trail no longer render on Rewards. They live on Home only now,
  so Rewards stays focused on the store, offers, and ways to earn.
- **Home streak widget → mini cube tray** — the old card spelled the streak
  out in words ("2 more weeks → 50% OFF..."). It's now a visual: a
  horizontal tray of 7 little cubes, one per day/week/month (whatever the
  streak period is set to), filled in solid white for each period completed.
  The next cube pulses with a ring so members see exactly where they are,
  milestone cubes wear a tiny gift icon, filled cubes get a flame. Long
  streaks roll in 7-cube windows (1–7, then 8–14, ...) so nothing squishes.
  The header shows the raw count ("5 · DAY STREAK") and tapping the card
  still opens the full streak panel.
- Side effect worth knowing: the old card hid itself once the first
  milestone was reached (it was a "teaser"). The cube tray is a permanent
  streak display, so it now stays visible as long as streaks are enabled.

## Files

Changed: `components/customer/rewards-client.tsx`,
`components/customer/streak-mini.tsx`.

Verified: full `tsc` = 0 errors + complete `next build` green in the cloud
mirror before shipping.

## Ship it

```bash
cd "C:/Users/andre/OneDrive/Documents/Claude/Projects/Atlas Engine APP"
git add checkpoint-70-streak-cubes "checkpoint-02-brand-engine/atlas-rewards-app"
git commit -m "CP-70: mini cube tray streak widget on Home; Spin/Streak removed from Rewards tab"
git push
```
