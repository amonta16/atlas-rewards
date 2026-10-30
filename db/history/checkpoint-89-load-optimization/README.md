# CP-89 — Load optimization: the polling cut + the caching layer

**Verified:** `tsc --noEmit` = 0 errors, full `next build` green (18/18 pages).
**Code changed:** 14 files. **No SQL. No visual changes.**

This is the last item from the go-live audit: the two changes that decide what one customer
*costs* per hour. CP-88 fixed what could fall over; CP-89 fixes what quietly burns money and
per-second quota.

---

## ⚠️ This push also carries your missing cron fix

Heads-up found while building this: your CP-88 push happened **before** the Vercel-Pro cron
files landed on disk, so `vercel.json` (per-minute push delivery + the 5-minute raffle sweep)
is sitting **uncommitted** in your working folder — which is why the Cron Jobs page still
shows `process-pending` at once a day. The push block below includes it. After deploying,
check Settings → Cron Jobs: you should see `* * * * *` on process-pending and `*/5 * * * *`
on raffles/sweep.

(Everything else from CP-88 made it into that push — I verified every file against git HEAD.)

---

## Part 1 — The polling cut

Six customer components re-polled Supabase every **60 seconds** as a "safety net in case
realtime drops" — even though every one already had a realtime subscription on the same data,
and most also refreshed on tab-focus. Cost: **~240 requests/hour per customer sitting idle on
Home**; at 200 concurrent sessions, ~48,000 requests/hour of pure insurance.

All six now poll at a **jittered ~5 minutes** (`jitteredPollMs()` in `lib/realtime-jitter.ts`
— the random spread stops a whole business's customers from polling on the same tick):

| File | Was | Now |
|---|---|---|
| `header-actions.tsx` | 60s (2 RPCs) | ~5–7 min |
| `daily-spin-button.tsx` | 60s (2 calls) | ~5–7 min, **+ gained the tab-focus refresh it was missing** |
| `checkin-countdown-chip.tsx` | 60s | ~5–7 min |
| `mystery-reward-card.tsx` | 60s | ~5–7 min |
| `spin-home-widget.tsx` | 60s | ~5–7 min |
| `raffle-section.tsx` | 60s | ~3–4 min (shorter on purpose — entry counts land in a table its realtime doesn't watch, so this poll is their only freshness source) |

**Net: ~240 → ~35 requests/hour per idle customer, a ~7× cut**, with zero functional change —
check-ins, spins and streaks still update instantly via realtime, and switching back to the
tab still refreshes immediately.

The 1-second *render* ticks (countdown displays) are untouched — they make no network calls.

## Part 2 — The caching layer

One render of the customer Home tab made **17 Supabase round-trips**: the same `businesses`
row fetched **five** times, `my_membership` and `featured_offer` each fetched **twice**,
`auth.getUser()` (a network call to Supabase Auth every time) **three** times, and
`enroll_member` — a database **write** — on every page view of every tab. The codebase had
zero React `cache()` usage.

### What changed

- **`lib/supabase/server.ts`** — `createClient` is now wrapped in React `cache()` (one client
  per request), and a new **`getCachedUser()`** memoizes the auth lookup: first caller pays
  the round-trip, everyone else in the render pass gets the memo. Route handlers are
  unaffected (`cache()` is a no-op outside a render).
- **New `lib/data/customer-app.ts`** — request-memoized `getBusinessBySlug()`,
  `getMyMembership()`, `getFeaturedOffer()`. Memoized *by argument, per request* — nothing is
  cached across requests, so a manager's brand edit still shows up on the very next load.
- **All five customer surfaces** (`app/[business]/layout.tsx` metadata + viewport, the app
  layout, Home, Rewards, Shop, Profile, Scan) now go through the shared helpers, so the
  layout's fetches make the page's copies free.
- **`enroll_member` is out of the hot path.** Verified against
  `checkpoint-25/01_enrollment_hardening.sql`: for an existing member it only backfills a
  missing referral code — it touches no activity timestamps, so gating it changes nothing
  for win-back/inactivity features. It now runs only when the member is new or their code is
  missing (once per customer, ever, instead of every page view).
- **The no-op `OffersRevalidator` mount is deleted** from Home (the CP-88 cleanup note).
- `BusinessLayout`'s `resolve_business_by_slug` RPC is deliberately **unchanged** — it's the
  anon-callable path from CP-01 (pre-login pages use it) and may not be RLS-equivalent to a
  table select.

### The numbers, per Home view

| | Before | After |
|---|---|---|
| Total Supabase round-trips | ~17 | **~9** |
| Auth calls in the render | 3 | **1** (+1 in middleware, which can't be deduped from here) |
| `businesses` row fetches | 5 | **1** |
| Database writes | 1 (`enroll_member`, every view) | **0** for existing members |

One tiny behavioural note: on a customer's very **first** visit ever, the Home page may
render its greeting/points before the enrollment lands (page and layout render
concurrently — a race that existed before this change too). It self-corrects on the next
navigation. Everything after their first visit is unchanged.

---

## Ship it

```bash
cd "C:\Users\andre\OneDrive\Documents\Claude\Projects\Atlas Engine APP"
git add checkpoint-89-load-optimization checkpoint-02-brand-engine/atlas-rewards-app
git commit -m "CP-89: polling 60s->5min jittered, React cache() request memoization, gate enroll_member write; commit Pro cron schedules"
git push
```

(`git add` on the app folder also picks up `vercel.json` + the line-ending-only churn on two
files git was already tracking as modified — both harmless and content-identical.)

## Verify after deploy

1. **Cron schedules updated** — Vercel → Settings → Cron Jobs: `process-pending` at
   `* * * * *`, `raffles/sweep` at `*/5 * * * *`.
2. **Push latency** — award a test member points that cross a reward threshold; the phone
   should buzz within ~1 minute (was up to 24 hours).
3. **The load drop** — leave one customer session open on Home for 10 minutes, then look at
   Supabase → Reports (API requests). Steady-state per-session traffic should be a small
   fraction of before. The weekly canary stays the same: Auth requests per 60 min in the low
   hundreds = healthy.
4. **Nothing broke** — check in as a test customer (streak + spin unlock instantly via
   realtime), spin the wheel (cooldown appears), edit the brand color in the agency editor
   and confirm the customer app shows it on next load (proves nothing is over-cached).
5. **New-member flow** — sign up a fresh test account, confirm the welcome bonus + referral
   code appear (the gated `enroll_member` path).

---

## State of the go-live list

- ~~Upgrades (Supabase Pro / Vercel Pro)~~ ✅ done
- ~~The stampede landmine~~ ✅ CP-88
- ~~Open API routes~~ ✅ CP-88
- ~~Per-minute push delivery~~ ✅ this push
- ~~Polling cut + caching~~ ✅ this checkpoint
- Remaining, none blocking launch: push fan-out batching (matters past ~500 push subscribers
  per business), `/agency` pagination (matters past ~100 tenants), members-directory
  server-side search (matters past 500 members per business), magic-link button cooldown +
  friendly rate-limit copy, out-of-sync `package-lock.json` (Capacitor deps — run
  `npm install`, commit the lockfile).
