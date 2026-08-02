# CP-93 — Boot-time business chooser + raffle notifications unblocked

**Verified:** `tsc --noEmit` = 0 errors, full `next build` green.
**Files:** 1 web (`app/join/page.tsx`) + 1 SQL. Web fix reaches the phone via Vercel — no rebuild.

## 1. The raffle error MOVED — that's progress, and this is the last layer

CP-92's search_path fix worked (`gen_random_bytes` is gone from the logs). The draw now runs
and hits the next wall: **`notifications_kind_check`** — a CHECK constraint on the
notifications table that predates raffles and rejects `raffle_won` / `raffle_winner_drawn` /
`raffle_ended`, aborting the sweep every 5 minutes.

Run `cp93_notifications_kind.sql`. It drops the constraint — the same medicine CP-44.1 gave
`points_ledger`'s equivalent, and for the same reason: `kind` is icon/routing metadata, and
this CHECK has now broken production twice while protecting nothing. **Do not re-add it.**

## 2. Business chooser at cold start

Exactly what you described: when a signed-in customer belongs to **more than one** business,
opening the app no longer silently forwards to the last-used shop. Instead they get a clean
"Where to today?" screen — each shop with its logo, name, and **current points balance**, the
last-used one tagged with a "Recent" chip — and nothing loads until they choose.

Behavior matrix (all decided behind the boot splash, so nothing flashes):

| Customer | Cold start does |
|---|---|
| Belongs to ONE business | Auto-forwards straight in — as fast as today |
| Belongs to SEVERAL | **Chooser screen first** |
| Signed out / brand new | Existing join-code / QR flow, unchanged |
| Opened via "Add another shop" (`?stay=1`) | Unchanged — no chooser hijack |
| Offline / RPC hiccup | Falls back to the old last-business forward |

The chooser also has "Join a new shop instead" underneath, and respects the safe-area inset
from CP-92. Bonus: choosing from a dedicated boot screen is a *clean* navigation — one more
place the offline-flash race can't happen.

## 3. About that offline flash when switching businesses

Same `-999` cancelled-navigation phantom as before — and the fix is already written
(CP-92's self-healing `error.html`) but **it lives inside the app binary and your installed
build still has the old page**. After your next Mac rebuild (`npx cap sync ios` → Run), the
flash becomes a sub-second "Loading…" blip that auto-recovers. Nothing more to code.

## Ship it

**Supabase:** run `cp93_notifications_kind.sql`.

**Windows:**
```bash
cd "C:\Users\andre\OneDrive\Documents\Claude\Projects\Atlas Engine APP"
git add checkpoint-93-business-chooser checkpoint-02-brand-engine/atlas-rewards-app/app/join
git commit -m "CP-93: boot-time business chooser for multi-shop customers; drop notifications_kind_check for raffle kinds"
git push
```

## Verify

1. Raffle: after the SQL, the next `/api/raffles/sweep` tick logs clean — and your stuck test
   raffle should finally draw its winner (winner + staff get pushes).
2. Chooser: after Vercel deploys, force-quit the app on your iPhone and reopen — you belong
   to Tacos El Viejon *and* Spa by the Bay, so you should land on "Where to today?" with both
   listed and your points showing. Tap one → straight in. Reopen → chooser again.
3. A single-business test account should still boot directly in with no extra screen.

## Noted, not fixed (cosmetic)

Your logs show `[subscribe] saved native token` firing ~8× in a session — each
`registerNativePush` call adds another `registration` listener without removing old ones, so
re-registrations multiply. Harmless (the upsert is idempotent, same row every time) but
noisy; a one-line `removeAllListeners` cleanup can ride along with the next checkpoint.
