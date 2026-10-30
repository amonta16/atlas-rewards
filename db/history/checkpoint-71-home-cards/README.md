# Checkpoint 71 — Bigger, Bolder Home Cards

The side-by-side Prize Wheel + Streak cards on Home felt small and empty.
Both got a full revamp, and the spin card now shows real stakes (points)
instead of an emoji.

## What changed

- **Spin card revamp** — taller (min 172px), rounded-3xl, a big watermark
  dice graphic in the corner, headline-size "Play now!", and the play
  button is now a full-width bar wearing the game's own CTA ("SPIN THE
  WHEEL!" / "REVEAL MY GIFT!" / "SPIN!"). On cooldown the chip shows the
  live countdown; locked shows "Check in at the counter to unlock".
- **"Win up to X pts" instead of emojis** — a coins chip in the top-right
  shows the biggest points prize actually in that business's mystery
  pool (e.g. "Win up to 300 pts"). If the pool only holds reward/coupon
  prizes it says "Prizes up for grabs"; if the RPC isn't deployed yet it
  falls back to "Win points & prizes". The full-width variant and the old
  ⭐💎🔥 emoji strip also swapped to the same treatment.
- **Streak card revamp** — giant 4xl streak numeral with flame, watermark
  flame art, a "N to reward" gift chip showing how close the next
  milestone is, and bigger cubes (rounded-md, larger flame/gift icons)
  in the tray.

## SQL — run once in Supabase

`cp71_prize_peek.sql` (after cp68) — adds `mystery_prize_peek(business_id)`,
a SECURITY DEFINER function that exposes ONLY the max point prize +
whether special prizes exist. No weights, no odds, no prize list leaks to
customers. Empty pool returns 300 to match the built-in default prizes.

Until this SQL runs, the cards still work — the chip just says
"Win points & prizes".

## Files

New: `checkpoint-71-home-cards/cp71_prize_peek.sql`
Changed: `components/customer/daily-spin-button.tsx`,
`components/customer/streak-mini.tsx`.

Verified: full `tsc` = 0 errors + complete `next build` green in the cloud
mirror before shipping.

## Ship it

```bash
cd "C:/Users/andre/OneDrive/Documents/Claude/Projects/Atlas Engine APP"
git add checkpoint-71-home-cards "checkpoint-02-brand-engine/atlas-rewards-app"
git commit -m "CP-71: bigger Home spin+streak cards, points teaser replaces emoji (mystery_prize_peek)"
git push
```
