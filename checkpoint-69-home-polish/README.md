# Checkpoint 69 — Home Polish Pass

Five refinements from Andrew's design review. No SQL — deploy and done.

## What changed

- **Call-now spacing** — the white band under the map had 7rem of bottom
  padding, leaving a big empty strip between the Call-now button and the
  bottom nav. Tightened to 5.5rem: the white still runs cleanly behind the
  nav, the dead space is gone.
- **Active-tab indicator** — the bottom nav now shows a subtle brand-tinted
  pill behind the active tab's icon (white-tinted on dark chrome) and the
  active label goes extrabold. You always know where you are.
- **White milestone cells** — streak milestone cells are now WHITE with
  theme-colored (inverted) content instead of gold-on-gold: solid white when
  reached, slightly translucent while upcoming. Gold rim + shimmer + the
  ★ REWARD badge stay, so rewards still pop — they just read better.
- **Demo streak animation** — demo apps (is_demo) play the streak count-up
  moment on EVERY panel open (not just after a check-in), and get a
  "↻ Demo: replay streak animation" button under the tray for on-demand
  replays mid-pitch.
- **News & updates revamp** — the tiny non-clickable rows became billboard
  cards: full-width image (h-36), real headline, two-line teaser, date, and
  a "Read more" affordance. Tapping opens a detail sheet with the full-size
  image, complete body text, and a brand CTA. New
  `components/customer/news-section.tsx`.

## Files

New: `components/customer/news-section.tsx`
Changed: `components/customer/app-shell.tsx`, `components/customer/location-card.tsx`,
`components/customer/streak-widget.tsx`, `app/[business]/app/page.tsx`.

Verified: full `tsc` = 0 errors + complete `next build` green in the cloud
mirror before shipping.

## Ship it

```bash
cd "C:/Users/andre/OneDrive/Documents/Claude/Projects/Atlas Engine APP"
git add checkpoint-69-home-polish "checkpoint-02-brand-engine/atlas-rewards-app"
git commit -m "CP-69: nav active pill, call-now spacing, white milestone cells, demo streak replay, news billboard cards"
git push
```
