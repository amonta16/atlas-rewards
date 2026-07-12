# CP-73.1 — Hotfix

Three fixes from Andrew's testing.

## 1. Spin error: `column reference "kind" is ambiguous`

`spin_daily_reward` returns a table with a column named `kind`, and in
PL/pgSQL those output columns are variables. CP-73's new
`and kind <> 'coupon'` filter collided with it. Every pool query is now
alias-qualified (`mrp.kind`). **Run `cp73_1_hotfix.sql` (after
cp73_migration.sql) — this is the actual fix; the error is server-side.**

## 2. Reward prizes reuse the reward's own image

No more separate photo upload for wheel prizes — that was redone work.
The wheel wedge, the win reveal, and the prize list all use the linked
reward's existing image automatically (`coalesce(prize_image_url,
rewards.image_url)`). The uploader was removed from the prize editor; a
note now says the reward's photo is used automatically.

## 3. Field App crashed on phones ("Application error: a client-side exception")

`field-nudge-bell.tsx` read `Notification?.permission` — but optional
chaining does NOT protect against the `Notification` global not existing
at all, and on iOS Safari (outside an installed PWA) it doesn't exist.
The bell threw a ReferenceError on mount and took the whole /field page
down. Desktop browsers all have the API, which is why it only died on
phones. Now guarded with `"Notification" in window`. Admins can open and
install the Field App from their phones again. (Note: on iPhone, push
permission itself only becomes available after Add to Home Screen — the
page now loads fine either way.)

## SQL — run once in Supabase

`cp73_1_hotfix.sql` — AFTER cp73_migration.sql. Fixes the spin error +
adds the reward-image fallback to `mystery_wheel_segments` and
`spin_daily_reward`.

## Files

New: `checkpoint-73-wheel-and-cards/cp73_1_hotfix.sql`
Changed: `components/agency/field-nudge-bell.tsx`,
`components/agency/mystery-pool-manager.tsx`.

Verified: full `tsc` = 0 errors + complete `next build` green in the cloud
mirror before shipping.

## Ship it

```bash
cd "C:/Users/andre/OneDrive/Documents/Claude/Projects/Atlas Engine APP"
git add checkpoint-73-wheel-and-cards "checkpoint-02-brand-engine/atlas-rewards-app"
git commit -m "CP-73.1: fix ambiguous kind in spin RPC, reward image reuse on wheel, Field App iPhone crash"
git push
```
