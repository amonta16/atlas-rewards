# CP-127 · Correction-aware analytics (mistaken awards stop polluting the numbers)

**The Exotic incident:** the desk mistakenly awarded a real member ~$1,000 worth of points. Deducting the points fixed the balance, but analytics kept the mistake everywhere — "points awarded" still counted it, the deduction showed up as a *redemption*, the member's lifetime total stayed inflated (Top Members), and the recorded ~$1,000 of spending never came down.

## What this changes

**Rule: a manual removal is a CORRECTION, not customer activity.**

1. **`manager_remove_points` v2** — removing points now also (a) deflates the member's lifetime points, and (b) removes the matching dollars from recorded spending. The desk app sends the dollar amount automatically (points ÷ the shop's points-per-$ rate) and shows the staff a line: *"Analytics will also remove ≈ $X of recorded spending."* Server-clamped — recorded spend can never go negative.
2. **Every analytics surface nets removals out of "awarded"** instead of counting them as redemptions: daily recap, Insights rollup, business analytics, daily activity chart, Atlas Impact (a removal also cancels the phantom "visit" the mistaken award implied). This is **retroactive** — the sums are computed live from the ledger, so Exotic's points numbers correct themselves the moment the SQL runs.
3. **Backfill** — lifetime points deflated for all past manual removals (idempotent, clamped at 0).
4. **One-off for Exotic's ~$1,000** — the deduction happened before this existed, so the spend correction was never written. A commented template at the bottom of the SQL removes it: fill in the member's email + amount in cents (e.g. $1,000 → `-100000`) and run that block once.

## Apply order

1. Run `cp127_corrections.sql` in the Supabase SQL editor (safe, re-runnable).
2. `git push` (the desk app change goes with it — deploy AFTER the SQL so the new RPC parameter exists).
3. Run the filled-in one-off block for the Exotic member.
4. Check Insights — awarded points and revenue should no longer show the mistake.

Rehearsed end-to-end on a scratch Postgres: award $1,000 + 5,000 pts → remove → every analytics RPC reads 0; clamps verified; backfill run twice deflates once.

## Push

```
cd "C:\Users\andre\OneDrive\Documents\Claude\Projects\Atlas Engine APP"
del ".git\index.lock"
git add .
git commit -m "CP-127: correction-aware analytics - removals net out of awarded/spend/lifetime, desk sends spend correction"
git push
```
