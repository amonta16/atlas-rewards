# Checkpoint 68 — Reward Games, Demo Mode & the Build Gate

Three things: the check-in reward is no longer one hardcoded animation,
demo apps can replay the reward moment endlessly during a pitch, and
TypeScript errors now block deploys (the CP-67 crash can't happen again).

## Check-in reward games (`businesses.reward_game`)

New **Check-in reward game** section in the brand editor:

| Game | The moment |
|---|---|
| 🎰 Slot machine (default) | The original three-reel lock-in |
| 🎡 Prize wheel | A glowing 8-segment wheel spins and eases onto the prize under a pointer |
| 🎁 Mystery boxes | Three gift boxes shuffle their glow, one pops open |

Same server-side prize engine (`spin_daily_reward`) for all three — the game
is pure showmanship, so switching games never changes odds or payouts. The
quick-action card and modal titles/CTAs adapt ("Daily Spin" / "Prize Wheel" /
"Mystery Box").

## Demo mode (`businesses.is_demo`)

- **Add Business** now has a "Demo app (for pitching)" checkbox — ON by
  default (new apps here are usually pitch demos). A matching toggle lives in
  the brand editor next to the reward game, for flipping OFF when a deal
  closes and real customers arrive.
- For demo apps the server skips BOTH reward gates (must-check-in-today +
  cooldown), the game card is always in its bright "ready" state, and the
  reveal screen gains a **"Demo: play again"** button — spin → reveal →
  replay, as many times as the pitch needs, with any of the three games.

## Red "!" on the reward quick action

The Daily Spin / reward game card (Home + Rewards tab, both sizes) now wears
the same red bouncing "!" as the header pills whenever the game is playable
and hasn't been opened today. It shares the header pill's seen-state, so
opening the game from either place clears both.

## Build gate (CP-67 post-mortem)

`next.config.mjs`: `typescript.ignoreBuildErrors` flipped to **false**. The
CP-67 production crash was a bug TypeScript had already caught — the old
`true` (a CP-32 go-live shortcut) let Vercel deploy it anyway. From now on a
type error fails the build and the previous deploy stays live. ESLint stays
non-blocking (style warnings shouldn't stop a ship).

## Apply it

Run **`cp68_games_and_demo.sql`** in the Supabase SQL editor (idempotent —
two columns + re-created spin functions with the demo bypass).

## Files

New:
- `checkpoint-68-reward-games/cp68_games_and_demo.sql`
- `atlas-rewards-app/lib/reward-games.ts`

Changed:
- `components/customer/daily-mystery-modal.tsx` — three games + demo replay.
- `components/customer/daily-spin-button.tsx` — "!" nudge, demo always-ready,
  game-aware copy.
- `components/agency/new-business-modal.tsx` — demo checkbox on create.
- `components/brand-editor/brand-editor.tsx` — game picker + demo toggle;
  both saved.
- `lib/types/database.ts` — `reward_game`, `is_demo`.
- `next.config.mjs` — type errors fail the build.

## Ship it

```bash
cd "C:/Users/andre/OneDrive/Documents/Claude/Projects/Atlas Engine APP"
git add checkpoint-68-reward-games "checkpoint-02-brand-engine/atlas-rewards-app"
git commit -m "CP-68: reward games (slot/wheel/boxes), demo mode with replay, spin nudge, TS build gate on"
git push
```

Then run `cp68_games_and_demo.sql` (step above).
