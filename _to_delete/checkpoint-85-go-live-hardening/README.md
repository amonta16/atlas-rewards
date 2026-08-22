# CP-85 — Go-live hardening: what has to happen before a paying client's customers arrive

**Status:** plan only. Nothing in here is built yet. Dashboard/billing steps you can do today;
code steps are scoped and ready to build on your go-ahead.

---

## The straight answer

**Is the thing we killed dead? Yes, permanently.** The mechanism is gone. The stale
pre-CP-81 host-only cookie now gets expired the moment it fails, so it can't shadow the real
session anymore, and prefetches no longer spend refresh tokens. That specific loop cannot
restart.

**Is the app safe under a real customer load? No, not yet.** Auditing it end-to-end for this
turned up **a second road to the exact same lockout** — and unlike the cookie bug, this one
fires on a completely normal business action. Plus you're about to put a paying client's
customer data on infrastructure with **no backups**, and your Vercel plan doesn't permit
commercial use.

Three things to fix. In order: money, the landmine, the security holes.

---

## Part 1 — Upgrades (do today, $45/mo)

| What | From | To | Why, specifically |
|---|---|---|---|
| **Supabase** | Free | **Pro, $25/mo** | Free has **no backups at all** — your dashboard says "No backups." A paying client's customer database with no recovery point is the single biggest risk here. Free also **pauses the project after 1 week of inactivity** (imagine that landing on a client's live app), keeps only **1 day of logs** (we nearly lost today's diagnostic window), caps the DB at 500 MB and egress at **5 GB/mo**. |
| **Vercel** | Hobby | **Pro, $20/mo** | This is a terms-of-service problem, not a performance one. Vercel: *"Hobby teams are restricted to non-commercial personal use only. All commercial usage of the platform requires either a Pro or Enterprise plan,"* where commercial explicitly includes *"receiving payment to create, update, or host the site."* You're charging clients. You are out of compliance today, and Hobby's guideline of ~1M function invocations/mo is also thin once real traffic lands. |
| **Resend** | Free | Free for now → **Pro $20/mo** when needed | Free is **100 emails/day**. Fine for one client at launch. The day a client's staff onboards a room full of customers, password resets and confirmations will hit it. Watch the Resend dashboard; upgrade when you cross ~60/day. |

**$45/mo now, $65/mo once email grows.** Against one paying client that's noise, and two of
the three are risk-elimination rather than performance.

Skip for now: Point-in-Time Recovery ($100/mo). Pro's daily backups with 7-day retention are
enough until you're carrying several clients' live data.

### The ceiling Pro still doesn't remove

Worth knowing before you promise a client scale — Supabase Realtime quotas:

| | Free | Pro |
|---|---|---|
| Concurrent connections | 200 | 500 |
| Messages / second | 100 | 500 |
| Channel joins / second | 100 | 500 |

Each customer session opens **one** WebSocket (good — it's a shared singleton) but subscribes
to **~16 channels** on the Home tab. So channel joins cap your *arrival rate*: at Pro's 500
joins/sec, roughly **31 customers can open the app per second** before joins start getting
rejected. And a single manager action that notifies 1,000 connected customers is 1,000
messages against a 500/sec ceiling. These limits are adjustable via Supabase support, but the
architecture is what's consuming them — see Part 4.

---

## Part 2 — The landmine (this is the one that matters)

**File:** `components/customer/offers-revalidator.tsx:18-23`

Every customer on the Home tab subscribes to the same per-business realtime topic
`offers-${businessId}`. When anything changes on that business's offers, each one calls
`router.refresh()`. Because `/[business]/app` is `force-dynamic`, that re-runs the whole
layout + page chain — **17 server round-trips, 3 of them `getUser()` calls to Supabase Auth.**

So: **a manager toggles one offer → every connected customer simultaneously fires ~19
requests.**

| Connected customers | Requests in the burst | Auth requests in the burst |
|---|---|---|
| 50 | ~950 | ~150 |
| 500 | ~9,500 | ~1,500 |
| 1,000 | ~19,000 | ~3,000 |

That is the same shape as the storm that locked you out on July 25 — thousands of auth calls
in seconds, tripping the per-IP and project rate limits — except triggered by a manager doing
their job. Three more components on that same page also listen to the `offers` table and
re-query independently (`featured-offer-banner.tsx:94`, `offer-reveal-watcher.tsx:174`,
`limited-offers-section.tsx:80`), so the same event is handled four times per customer.

**Fix:** drop the `router.refresh()` and re-fetch just the offer into state like its sibling
components already do; add random jitter (0–5s) to every realtime-triggered reload so 1,000
clients don't move in lockstep; collapse the four `offers` listeners into one channel with one
handler. Same pattern needs the jitter treatment in `announcement-banner.tsx:54`,
`header-actions.tsx:119` and `raffle-section.tsx:108`.

**This should be fixed before the client's customers arrive, not after.**

---

## Part 3 — Security holes (a real client's data changes the stakes)

These were survivable while it was 59 test users. They aren't now.

1. **`/api/notifications/push-fanout` has no authentication at all**
   (`route.ts:33-89`). It accepts `{record: {user_id, title, body}}` from *any* caller and
   sends a push notification to that user using the service-role client. Anyone who finds the
   URL can send arbitrary push notifications to your clients' customers, in your client's
   brand, at unbounded cost.

2. **`/api/raffles/sweep` is unauthenticated and runs a service-role write**
   (`route.ts:19-21` says "No auth required"), calling the global cross-tenant
   `finalize_due_raffles()` RPC and then fanning out pushes. It's also called by **every
   customer on mount** (`raffle-section.tsx:106`), so 1,000 customers means 1,000 concurrent
   service-role writes queuing on a row lock.

3. **`/api/notifications/process-pending` fails open** — `route.ts:30` reads
   `if (cronSecret && auth !== ...)`. With `CRON_SECRET` unset, the check is skipped
   entirely and anyone can drain your push queue. `CRON_SECRET` is not in your local env.

4. **Rate limiting is effectively off.** `lib/rate-limit.ts:28` only uses Upstash when
   `UPSTASH_REDIS_REST_URL`/`_TOKEN` are set; otherwise it falls back to an in-memory Map
   *per lambda instance*, so your "10 broadcasts per 60s" cap silently becomes 10 × however
   many instances Vercel spun up. (I could only see your local `.env.local` — if these are
   already set in Vercel's production env, items 3 and 4 are already fine. Worth checking.)

---

## Part 4 — Where the load actually goes

Not urgent-broken, but this is what decides your cost and your ceiling.

### Polling: ~240 network requests/hour per active customer

Six components poll on 60-second timers, and each poll makes 1–2 Supabase calls:

| File:line | Every | Calls per tick |
|---|---|---|
| `header-actions.tsx:184` | 60s | 2 RPCs (`get_streak_status`, `member_checkin_status`) |
| `daily-spin-button.tsx:142` | 60s | 1 select + 1 RPC |
| `checkin-countdown-chip.tsx:91` | 60s | 1 RPC |
| `mystery-reward-card.tsx:79` | 60s | 1 RPC |
| `spin-home-widget.tsx:66` | 60s | 1 RPC |
| `raffle-section.tsx:117` | 60s | 1 RPC |

A customer sitting on the Home tab generates **~240 requests/hour doing nothing**. At 200
concurrent sessions that's ~48,000 requests/hour, which at a conservative 2 KB each is
roughly **2 GB/day of Supabase egress** — Free's entire 5 GB monthly allowance in under three
days. (Real usage is burstier than "always open," so treat this as the per-active-session
rate, not a flat multiplier. Staff kiosks that stay open all day *are* the worst case.)

The kicker: every one of these polls is labelled a "safety net in case realtime drops" — and
every one already has a realtime subscription watching the same data. Raising them to 5–10
minutes is a **5–10× cut in steady-state load** with no functional change.

### 17 round-trips to render one Home page

Verified on `/[business]/app`. Includes:

- **The same `businesses` row fetched 5 separate times** in one render
  (`[business]/layout.tsx:28`, `:42`, `:89`, `app/layout.tsx:27`, `app/page.tsx:45`) — and
  most of them are `select('*')` on a wide table carrying hero images, brand config and
  welcome copy.
- **`my_membership` and `featured_offer` each called twice** (layout + page).
- **`enroll_member` — a database write — runs on every single page view of every tab**
  (`app/[business]/app/layout.tsx:33`). It's idempotent, but it's a write in the render path.
- **Zero request-level memoization.** There is no React `cache()` anywhere in the codebase,
  and `lib/supabase/server.ts:6` builds a fresh client on every call.

Wrapping `createClient`, a `getCachedUser()` and a `getBusiness(slug)` in React `cache()`
takes this from 17 round-trips to roughly 10, and from 3 auth calls to 1 — a one-file change
plus call-site edits.

### Everything is dynamic

53 files carry `force-dynamic`. Zero `revalidate`, zero `unstable_cache`, **zero static
routes**. Even anonymous visitors trigger a full server render with database calls. The
per-business brand config in `generateMetadata`/`generateViewport` changes maybe weekly and is
re-fetched on every hit — an obvious `unstable_cache` + `revalidateTag` win.

### Two unbounded fan-outs

- `lib/notifications/push-server.ts:70,80` — selects **every** push subscription for a
  business with no limit, then `Promise.all`s over all of them in one serverless invocation.
  At 1,000 subscribers that's ~1,000 simultaneous outbound connections from one lambda; it
  will hit the wall clock and get killed mid-send, and there's no delivery record, so a retry
  re-sends to everyone who already got it. Needs batching (~50 in flight), a paged select,
  per-subscription state, and a `maxDuration` in `vercel.json`.
- `app/(agency)/agency/page.tsx:46` — `select('*')` on **all** businesses with no `.limit()`
  or pagination. Fine at 10 tenants, painful at 500.

### Small correctness cliff

`components/manager/members-directory.tsx:33` hard-codes `p_limit: 500, p_offset: 0` and
filters client-side. At 501+ members, front-desk staff simply cannot find anyone past the
first 500 — no error, no indication. Move search server-side before any client crosses 500
members.

---

## Fix order

**Before the client's customers arrive:**

1. Supabase Pro + Vercel Pro. (10 minutes, $45/mo)
2. Kill the `router.refresh()` stampede and jitter realtime reloads. *(Part 2 — this is the
   one that reproduces the outage)*
3. Authenticate `push-fanout`; gate or remove the client-side `raffles/sweep` calls; make
   `process-pending` fail **closed**; set `CRON_SECRET` and the `UPSTASH_*` keys in Vercel.
4. Raise the six 60s polls to 5–10 minutes. *(one-line changes, 5–10× load cut)*

**Soon after:**

5. React `cache()` for the client, user and business lookups; drop the duplicate
   `my_membership` / `featured_offer` calls; move `enroll_member` out of the render path.
6. Batch + page the push fan-out; set `maxDuration`.
7. `unstable_cache` the per-business brand config with tag invalidation on save.
8. Paginate the agency business list; move members-directory search server-side.

**Still open from earlier checkpoints:** 60-second cooldown on the magic-link button, friendly
copy for rate-limit errors instead of raw Supabase strings, and the out-of-sync
`package-lock.json` (Capacitor deps missing — `npm ci` fails outright today).

---

## How to know it worked

- Supabase → Home, **Auth requests over 60 minutes**: should sit in the low hundreds with a
  handful of active users, not tens of thousands. This is your canary — check it weekly.
- Have someone toggle an offer while two or three customer sessions are open, and watch the
  request counter. It should barely move. Today it jumps by ~19 per connected customer.
- Supabase → Reports → egress trend, after the polling change. Should drop 5–10×.
- Vercel → Logs, filter `refresh_token_already_used`: silent.
