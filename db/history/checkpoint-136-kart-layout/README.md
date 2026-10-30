# CP-136 · Kart rewards layout

Andrew's sticky-note idea: a Mario-Kart-style reward row. A skewed nameplate carries the reward name, its cost and the progress bar; the photo tile is slightly larger, tilted the *other* way, and pushed over the plate's right edge.

**No SQL. Nothing to apply — push and it's live.** `businesses.rewards_layout` is a free-text column (CP-66 never added a CHECK), so `kart` is valid the moment the code ships. Verified against the live database: the only layout CHECK on `businesses` is `layout_preset`.

## What it is

A fifth value on `rewards_layout`, alongside `grid` · `list` · `carousel` · `spotlight`. Nothing moves for any existing business until it's picked in the builder — Exotic, Flippos, Dermis and every demo stay exactly as they are.

- **One reward per row, always.** The tilted tile eats horizontal space, so the row never goes two-up.
- **Cost sits on the name line**, right-aligned, so the plate reads as one unit.
- **The bar spans the plate**, under the name — white and full when the reward is claimable.
- **Locked stays a real button** (grey tile, lock chip, "590 to go") and opens the detail sheet, per CP-105. It is never `disabled`.
- **A skewed divider between rows.** Same angle as the plate, trailing off to the right in two short dashes like speed lines — `KartRowDivider` in `components/customer/section-elements.tsx`, shared by all three surfaces. Quiet on purpose: it is structure, and the photo tile is already doing the shouting.
- **Claimable floods the plate** with the brand gradient — but only on the default `classic` reward-card preset. Luxe, midnight, outline, glow and tint keep their own shell chrome, the same rule the Home top-rewards cards already follow, so a business's picked skin is never clobbered.

## Geometry

`lib/section-layouts.ts` owns the numbers, and owns them alone:

```
KART_TILT_DEG   = 6     // plate skew
KART_OVERLAP_PX = 10    // how far the tile bites into the plate
```

plus `kartRowStyle()` · `kartPlateStyle()` · `kartPlateInnerStyle()` · `kartTileStyle()`.

The row is **`2fr 1fr`** — two-thirds nameplate, one-third photo, photo on the right — in fractions, never fixed px, so it fits a 320px phone as happily as a tablet and can never run past the screen edge. (The first cut used a fixed 116px tile plus a 6px nudge, which overflowed on narrow phones. Fixed.)

Grid placement is set in the style objects, not in Tailwind classes, so the plate and tile can never land in the wrong column.

The tile rotates ~**half** the plate's skew (3.3°) — matching them makes the row read as broken rather than fast.

To retune the look, change those two constants. Every surface follows.

## Where it lives

- **`lib/section-layouts.ts`** — `RewardsLayoutId` gains `"kart"`, `REWARDS_LAYOUTS` gains the 🏁 entry, and the four geometry helpers are added at the bottom.
- **`components/customer/rewards-client.tsx`** — the Rewards-tab store gets a `kart` branch (container `space-y-4`), rendered as a two-column CSS grid: plate left at 2fr, tile right at 1fr, plate bleeding under the tile by 10px. Also fixes the empty-state card, which hard-coded `col-span-2` and only made sense in grid/spotlight.
- **`components/customer/top-rewards-grid.tsx`** — the Home "Top rewards" section reads the same `REWARDS_LAYOUTS` through `home_rewards_layout`, so it gets a matching `renderKart` at Home scale. Without it, picking Kart for Home would have silently fallen back to grid.
- **`components/customer-preview/customer-preview.tsx`** — the builder's phone preview mirrors the kart rows live, so the picker isn't a guess.
- **`components/customer/section-elements.tsx`** — new `KartRowDivider`, alongside the CP-67 heading and section-divider elements. No hooks, no `"use client"`, so it works from server pages and client components alike, same as its neighbours.
- **`components/brand-editor/brand-editor.tsx`** — a structural mini-mock for kart in the *Rewards store layout* picker; both rewards pickers widen from 4 to 5 columns.

## Verified

- `esbuild` parse of all five changed files: clean.
- `tsc --noEmit --skipLibCheck` over the five files: no syntax errors, no unbound identifiers.
- Live-database constraint check: `rewards_layout` is unconstrained text, so no migration is needed.

**Not** verified: the full project-wide cloud-mirror `tsc` (the CP-68.1 gate). `device_bash` can't mount the repo since the Sept 8 Windows update, so the tarball step of that harness couldn't run this session. The Vercel build is the gate — watch the deploy, and the preview URL on the PR once branch protection is on.

## Known gaps (next)

- Kart is rewards-only. Limited offers still have their own four shapes (`stack` · `coupon` · `carousel` · `billboard`); a kart-styled offer row would be the natural follow-on.
- The tilt and the 2:1 split are fixed per install, not per business. If a client wants a flatter or sharper angle, it needs a `kart_tilt` column — deliberately not built until someone asks.
