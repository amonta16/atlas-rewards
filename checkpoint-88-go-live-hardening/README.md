# CP-88 — Go-live hardening: the second stampede + the open endpoints

**Supersedes `checkpoint-85-go-live-hardening/`** — that folder was misnumbered (CP-85 was
already the raffle giveaway). Delete it; this is the real one.

**Verified:** `tsc --noEmit` = 0 errors, full `next build` green (18/18 static pages).
**Code changed:** 9 files. **No SQL.**
**Requires two env/dashboard steps BEFORE you deploy — see "Deploy order" below. Read that first.**

---

## Why this exists

CP-84 killed the July 25 refresh-token storm for good. Auditing the app for a paying client's
launch turned up **a second path to the identical lockout** — this one triggered by a manager
doing their job, not by a bug — plus three API routes reachable by anyone on the internet.

You picked the landmine + security set. That's what's built here. The load/caching work from
the audit is queued at the bottom, unbuilt.

---

## ⚠️ Deploy order — do these two things FIRST

This checkpoint closes an authentication hole in `push-fanout`, which Supabase calls via a
Database Webhook. **Deploy before configuring it and phone pushes stop working** (401s,
silent from the customer's side). Reversible in seconds, but do it in this order:

**1. Set `CRON_SECRET` in Vercel** (Project → Settings → Environment Variables, Production).
Generate a value however you like — e.g. `openssl rand -hex 32`, or any long random string.
If you already have `CRON_SECRET` set, reuse it.

**2. Add the matching header to the Supabase webhook.**
Supabase → Database → **Webhooks** → the webhook pointing at
`/api/notifications/push-fanout` → Edit → **HTTP Headers**:

```
x-atlas-secret: <the same CRON_SECRET value>
```

Then deploy. If pushes go quiet afterwards, that header is the first thing to check —
Vercel logs will show `[push-fanout] rejected: unauthorized`.

While you're in Vercel env vars, also set `UPSTASH_REDIS_REST_URL` and
`UPSTASH_REDIS_REST_TOKEN` if you haven't. Without them `lib/rate-limit.ts:28` falls back to a
per-lambda in-memory Map, so your "10 broadcasts per 60s" cap silently becomes 10 × however
many instances Vercel spun up. (Not changed in code here — it's a config gap, not a bug.)

---

## What changed

### 1. The landmine: `router.refresh()` on a per-business realtime topic

**`components/customer/offers-revalidator.tsx`** — neutralised.

Every customer on the Home tab subscribed to `offers-${businessId}` and called
`router.refresh()` on any offers change. `/[business]/app` is `force-dynamic`, so that re-ran
the whole layout+page chain: **~17 Supabase round-trips, 3 of them `getUser()`**. Because the
topic is per-*business*, one manager toggling one offer fanned out to every connected customer
simultaneously:

| Connected customers | Requests in the burst | Auth requests in the burst |
|---|---|---|
| 50 | ~950 | ~150 |
| 500 | ~9,500 | ~1,500 |
| 1,000 | ~19,000 | ~3,000 |

Same shape as the July 25 outage. It would have gone off on the first busy day.

**Safe to remove because nothing depended on it.** Three sibling components already subscribe
to the same `offers` table and re-query just their own slice —
`featured-offer-banner.tsx:94`, `limited-offers-section.tsx:80`,
`offer-reveal-watcher.tsx:174`. The same event was being handled four times per customer; the
targeted fetches cost 1–2 RPCs, the `router.refresh()` cost ~17. "Manager features an offer →
customer's banner updates live" still works, via the banner's own listener.

The component is left as a documented no-op so this stays a one-file change with no broken
import. Deleting the mount from `app/[business]/app/page.tsx` is safe cleanup later.

### 2. New: `lib/realtime-jitter.ts`

A shared `createJitteredHandler(fn, {maxDelayMs, minGapMs})` that does two things:

- **Jitter** — each client waits a random slice of the window before acting, turning a spike
  into a ramp.
- **Coalesce** — while a reload is pending, further events are dropped rather than queued. A
  manager dragging a slider emits dozens of row updates; the client only needs the final
  state, and one fetch gets it.

This matters beyond raw request count: Supabase Realtime on Pro caps at **500 messages/second
and 500 channel joins/second**. Lockstep responses to a shared topic blow through that quota
well before your customer count gets impressive.

Applied to `raffle-section.tsx` and `announcement-banner.tsx` (both per-business topics).
`header-actions.tsx`'s `streak_config` listener is the same pattern and is a good next
candidate — left alone here to keep the diff reviewable.

### 3. `/api/notifications/push-fanout` — was completely unauthenticated

`route.ts` took `user_id`, `title` and `body` straight from the request body and sent a push
via the service-role client. Anyone who found the URL could send arbitrary push notifications
to any customer of any client, in that client's branding, at unbounded cost — and pushes are
the one surface that reaches a lock screen. Now requires the machine secret and **fails
closed**.

### 4. `/api/raffles/sweep` — unauthenticated service-role write, called by every customer

The old header said *"No auth required: the endpoint only triggers draws that are already
due."* Two holes in that:

- An open service-role write endpoint is free DoS. Hammer it and you queue row locks in
  Postgres and burn connections on your bill.
- It was called by **every customer on mount** of the Rewards tab — three separate call sites
  in `raffle-section.tsx`. At 1,000 customers that's 1,000 concurrent global sweeps
  serializing on one row lock, for work that only needs doing once.

Fixed on both sides: the route now requires machine secret **or** a signed-in session, and the
three customer-side calls are gone. Finalization comes from the pg_cron backstop; the
customer's UI picks up the state flip through the Realtime subscription that was already
there. Staff-initiated sweeps from `raffle-manager.tsx:391` still work — same-origin fetch
carries the session cookie.

### 5. `/api/notifications/process-pending` — failed open

```ts
if (cronSecret && auth !== `Bearer ${cronSecret}`) return 401;   // ← old
```

With `CRON_SECRET` unset the check was skipped entirely, so anyone could `GET` it and drain
the pending-push queue. `CRON_SECRET` was not set locally. Now fails closed.

### 6. New: `lib/api-auth.ts`

One implementation of the gate, shared by all three routes. Accepts
`Authorization: Bearer <CRON_SECRET>` (what Vercel Cron sends) or `x-atlas-secret`
(for Supabase webhooks, which can set custom headers but not Authorization reliably). Returns
**503, not 401**, when no secret is configured — so a misconfigured deployment is loud and
distinguishable from a bad credential. Comparison is length-checked and doesn't early-exit on
the first differing byte.

---

## Something I found on the way: your pushes are up to 24 hours late

`process-pending`'s docblock claims *"the cron runs once a minute so trigger-fired
notifications ring phones within ~60s."* It doesn't. `vercel.json` has it at `0 12 * * *` —
**once a day** — because **Vercel's Hobby plan caps cron jobs at once per day**, with ±59
minutes of scheduling slop. Any more frequent expression fails at deploy time.

So right now a customer who unlocks a reward can wait up to a day for the push. For a client
launch that's a visible quality problem, not just a config detail.

**Vercel Pro drops the minimum interval to once per minute.** After upgrading, change
`vercel.json`:

```json
{ "path": "/api/notifications/process-pending", "schedule": "* * * * *" }
```

Deliberately **not** changed in this checkpoint — committing a per-minute cron while still on
Hobby fails the deployment outright.

---

## The upgrades (still yours to click — $45/mo)

| What | To | Why |
|---|---|---|
| **Supabase** | Pro, $25/mo | Free has **no backups at all** — your dashboard says "No backups." A paying client's customer database with no recovery point is the biggest single risk in this whole audit. Free also pauses the project after 1 week of inactivity, keeps 1 day of logs, and caps egress at 5 GB/mo. |
| **Vercel** | Pro, $20/mo | Two reasons now. (a) Terms: *"Hobby teams are restricted to non-commercial personal use only. All commercial usage requires either a Pro or Enterprise plan"* — where commercial explicitly includes *"receiving payment to create, update, or host the site."* You're charging clients. (b) It's what unblocks per-minute crons, i.e. the 24-hour push delay above. |
| **Resend** | free → Pro $20/mo when needed | Free is 100 emails/**day**. Fine for one client; watch the dashboard and upgrade past ~60/day. |

Skip Point-in-Time Recovery ($100/mo) for now — Pro's daily backups with 7-day retention are
enough until you're carrying several clients' live data.

**Ceiling Pro does not remove:** Realtime caps at 500 concurrent connections, 500 msg/s, 500
joins/s. Each customer session opens one WebSocket but ~16 channels, so joins cap your
*arrival* rate at roughly 31 customers opening the app per second. Adjustable via Supabase
support — worth asking before a launch day with a queue at the front desk.

---

## Ship it

```bash
cd "C:\Users\andre\OneDrive\Documents\Claude\Projects\Atlas Engine APP"
git add checkpoint-88-go-live-hardening checkpoint-02-brand-engine/atlas-rewards-app/lib checkpoint-02-brand-engine/atlas-rewards-app/app/api
git rm -r --cached checkpoint-85-go-live-hardening 2>$null
git add -A checkpoint-02-brand-engine/atlas-rewards-app/components/customer
git commit -m "CP-88: kill realtime router.refresh stampede, authenticate push-fanout/sweep/process-pending, add jitter helper"
git push
```

(The `git rm --cached` line only matters if you committed the misnumbered CP-85 folder
earlier. Harmless either way.)

---

## Verify after deploy

1. **Pushes still work.** Trigger any notification (award points to a test member). Vercel
   logs should show `[push-fanout] ... sent=1`, not `rejected: unauthorized`. If rejected, the
   `x-atlas-secret` header is missing or mismatched.
2. **The stampede is gone.** Open two or three customer sessions, then have someone toggle an
   offer in the manager. Watch Supabase → Home → Auth requests. It should barely move.
   Before this change it jumped ~19 requests per connected customer.
3. **The banner still updates live.** Same test — the featured offer on the customer's Home
   should change without a manual refresh. That's the sibling listener doing its job; if it
   doesn't, tell me, because that's the one regression risk in removing the refresh.
4. **Anonymous callers are blocked.** From a terminal:
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" -X POST https://app.atlas-engine.app/api/raffles/sweep
   curl -s -o /dev/null -w "%{http_code}\n" -X POST https://app.atlas-engine.app/api/notifications/push-fanout -d '{}'
   ```
   Both should print `401`. Before this they'd have run.
5. **Raffles still finalize.** Set a test raffle to end in two minutes, leave the Rewards tab
   open, and confirm it flips to a winner without you touching anything. This now depends on
   pg_cron rather than the customer-triggered sweep — worth confirming once that the pg_cron
   job is actually installed and enabled in your project.
6. **Weekly canary going forward:** Supabase → Home → Auth requests per 60 minutes. Low
   hundreds with a few active users is healthy. Tens of thousands means something is looping.

---

## Queued, not built (from the audit)

Ordered by value. Say the word on any of them.

1. **The polling cut** — six components poll on 60s timers, each 1–2 Supabase calls, for a
   total of **~240 requests/hour per active customer sitting idle on Home**. Every one is a
   "safety net" for data that already has a realtime subscription. Raising them to 5–10
   minutes is a **5–10× cut in steady-state load** with no functional change. Cheapest win
   left on the table.
2. **Request-level caching** — a Home render makes **17 round-trips**, including the same
   `businesses` row fetched **5 times**, `my_membership` and `featured_offer` each twice, and
   `enroll_member` (a database *write*) on every page view of every tab. There is **zero**
   React `cache()` in the codebase. Wrapping `createClient`, `getCachedUser` and
   `getBusiness(slug)` takes it to ~10 round-trips and 1 auth call.
3. **Push fan-out batching** — `push-server.ts:70,80` selects every subscription for a
   business with no limit and `Promise.all`s over all of them in one invocation, with no
   `maxDuration` set. At 1,000 subscribers it will hit the wall clock and get killed
   mid-send, and there's no delivery record, so a retry re-sends to everyone who already got
   it.
4. **`unstable_cache` the brand config** — `generateMetadata`/`generateViewport` hit the DB
   for brand colors and logo on every request, for data that changes weekly. 53 files are
   `force-dynamic`; there are zero static routes.
5. **Paginate `/agency`** — `page.tsx:46` selects `*` from all businesses with no limit.
   Fine at 10 tenants, painful at 500.
6. **`members-directory.tsx:33`** hard-codes `p_limit: 500` and filters client-side. At 501+
   members, front-desk staff silently cannot find anyone past the first 500. Move search
   server-side before any client crosses that.
7. **From earlier checkpoints:** 60-second cooldown on the magic-link button; friendly copy
   for rate-limit errors instead of raw Supabase strings; `package-lock.json` is out of sync
   with `package.json` (Capacitor deps missing — `npm ci` fails outright today, so Vercel is
   falling back to `npm install`).
