# Checkpoint 27 — Smaller pills + reward progress bars

UI-only. No SQL.

## What Andrew asked for

1. Resize the quick-action pills a bit smaller so all three fit
   comfortably on a phone-width header.
2. Add a small progress bar on each reward card showing how close the
   customer is to that reward (e.g. 70 / 100 pts = 70 %).

## What CP-27 ships

### Smaller pill quick-actions

Live header (`components/customer/header-actions.tsx`):
- Pill height: `h-10` (40px) → `h-8` (32px)
- Padding: `pl-2.5 pr-3.5` → `pl-1.5 pr-2.5`
- Gap: `gap-1.5` → `gap-1`
- Icon size: 18px → 15px
- Label text: 12px → 11px
- Badge sizes scaled down proportionally (locked padlock 4→3.5px,
  pulse dot 3→2.5px, count bubble 20→18px).

Admin preview (`components/customer-preview/customer-preview.tsx`)
mirrors all of the same values at one notch smaller (h-9 → h-7,
icon 16 → 13, text 11 → 10) so the phone-frame preview accurately
reflects what the customer will see at phone width.

### Reward progress bars

Applied in three places:

- **Rewards tab** (`components/customer/rewards-client.tsx`):
  thin 1.5px gradient bar under each reward card.
  Locked rewards: brand-color gradient + `"X / Y · N to go"` label.
  Unlocked rewards: emerald gradient + `"Tap to redeem ✨"`.
- **Home tab Top Rewards** (`app/[business]/app/page.tsx`): same
  treatment, slightly tighter copy at 9px so the card stays compact.
  Uses `mem.points_balance` (the same value the live member card shows).
- **Admin preview** (`components/customer-preview/customer-preview.tsx`):
  representative bars using the 50-pt demo balance on the Home tab and
  1,240-pt demo balance on the Rewards tab, so the agency sees what the
  bar will look like before they have real customers.

All bars cap at 100 %, use `Math.min(100, points/cost * 100)`, and
animate via `transition-all duration-700` so live point changes count up
visually alongside the LiveMemberCard.

## Files touched

```
components/customer/header-actions.tsx              (pill resize + badge resize)
components/customer-preview/customer-preview.tsx     (pill resize + reward bars)
components/customer/rewards-client.tsx               (rewards-tab progress bar)
app/[business]/app/page.tsx                          (home top-rewards progress bar)
checkpoint-27-pill-resize-and-progress/README.md     (this file)
```
