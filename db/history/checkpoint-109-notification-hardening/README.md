# CP-109 — Notification system production-readiness audit

**Scope:** every notification producer, delivery channel, API endpoint, scheduled job, queue, realtime subscription and client listener in the customer + manager + agency apps, audited for tenant isolation, recipient authorization, timing correctness and idempotency. Every path below was traced end-to-end from trigger to delivery before being marked ready.

**Verification:** the migration and the isolation suite were **executed** (not just reviewed) against a scratch PostgreSQL 16 database carrying a faithful replica of the pre-fix schema. The suite fails on the pre-fix schema (first failure: the `list_pending_pushes` cross-tenant read) and passes fully after `cp109_notifications_hardening.sql`. The app build passes the full cloud-mirror gate (`tsc --noEmit` = 0 errors, `next build` green) and `npm test` = 5/5.

---

## 1. Deploy runbook (order matters)

1. **Supabase → SQL editor:** run `cp109_notifications_hardening.sql` (this folder). Idempotent; safe to re-run; no destructive changes. It is backward-compatible with the currently-deployed app, so apply it first.
2. **Deploy the app build** (this commit) on Vercel.
3. **Verify:** run `notification_isolation_test.sql` in the SQL editor — it must end with `✅ ALL NOTIFICATION ISOLATION TESTS PASSED`. It runs inside a transaction and ROLLS BACK; it leaves no data behind and is safe on production.
4. Locally, `npm test` covers the machine-auth gate.

---

## 2. Notification inventory (all wired-up notifications)

| # | Notification | Trigger | Recipients | Channel(s) | Timing | Business scoping | Files / objects | Covered by |
|---|---|---|---|---|---|---|---|---|
| 1 | Review verified | DB trigger on `reviews` update → verified | The reviewing member | In-app row → push via cron | Immediate (push ≤60s) | `business_id` from membership at insert | `_notif_review_verified` (cp32) | T1/T2 feed tests |
| 2 | Daily check-in confirmation | DB trigger on `check_in_events` insert (first of day) | The member who checked in | In-app → push via cron | Immediate | membership → business join | `_notif_daily_check` (cp32) | T1/T2 |
| 3 | Automated offer assigned | DB trigger on `automated_offer_assignments` | Each assigned member | In-app → push via cron | Immediate | membership join | `_notif_automated_offer` (cp32) | T1/T2 |
| 4 | Reward expiring soon | `notify_expiring_redemptions(biz)` (manual/pg_cron) | Members with pending redemptions expiring <48h | In-app → push via cron | Scheduled | `business_id` arg + redemption join; **dedupe now business-scoped (E1)** | cp32 → **redefined in cp109** | T3b + T8a |
| 5 | Check-in available / spin ready | Queue row on check-in, fires +12h | The member | Queue → in-app → push via cron | Scheduled (12h) | queue row carries business_id; **drain re-verifies membership + cooldown (Q2)** | `_queue_checkin_available_notif`, `fire_due_notifications` — **both redefined in cp109** | T3/T5/T6 |
| 6 | Reward unlocked (threshold crossed) | Staff award via `/api/notifications/award-event` | The awarded member | In-app + immediate push | Immediate | staff-gated (`staffs_business`); **membership now verified to belong to the business (A1)** | `award-event/route.ts` | route change + manual check |
| 7 | Manager broadcast ("Send to all") | Manager UI → `/api/notifications/broadcast` | All members of the business | In-app + immediate push | Immediate | SQL-gated (`broadcast_notification`), push via business-tagged subs; **now stamps `push_sent_at` (DUP1)** | `broadcast/route.ts`, `broadcast_notification` (cp109) | T1/T2 + dup logic in migration |
| 8 | Announcement ("closing early") | Manager UI → `/api/notifications/announce-message` | All members | In-app (stamped) + push + realtime banner | Immediate | manager-gated; banner realtime filtered by `business_id` | `announce-message/route.ts`, `announcement-banner.tsx` | route audit |
| 9 | New offer / raffle launched | Staff UI → `/api/notifications/announce-offer` | All members (master toggle honored) | In-app (stamped) + push | Immediate | staff-gated; **rate limit added** | `announce-offer/route.ts` | route audit |
| 10 | Raffle won / winner drawn (staff) | `/api/raffles/sweep` cron → `finalize_due_raffles` | Winner; business staff | In-app + immediate push | Scheduled (5-min sweep) | SQL inserts business-scoped; sweep pushes CP-51-scoped; **stamp trigger kills the double push (DUP1)** | `raffles/sweep/route.ts`, cp85 SQL, `_notif_stamp_direct_push` (cp109) | migration logic |
| 11 | Win-back ("we miss you") | Manager UI → `send_winback` | Selected inactive members | customer_messages + push | Immediate | manager-gated SQL (cp43/86) | `send_winback` | out of band (existing) |
| 12 | Membership activated | Front desk activates pending membership | The new member | In-app → push via cron | Immediate | membership join (cp86) | `activate_pending_membership` | T1/T2 |
| 13 | Field-app daily nudge | Vercel cron 2×/day → `/api/admin-app/daily-nudge` | **Agency admins only** (internal) | `admin_notifications` + push (business_id = null) | Scheduled | global-by-design; RLS owner-only; null-tagged push reaches only null-tagged subs | `daily-nudge/route.ts`, cp63_2 | route audit |
| 14 | Pending-push processor | Vercel cron `* * * * *` → `/api/notifications/process-pending` | Whoever's rows are pending | Web push / FCM | Scheduled (≤60s) | per-row `business_id` → CP-51-scoped send; machine-secret gated | `process-pending/route.ts` | T8 gate tests + npm test |
| 15 | Push fan-out webhook | Supabase DB webhook → `/api/notifications/push-fanout` | Row's user | Push | Immediate | per-row business scoping; machine-secret gated | `push-fanout/route.ts` | npm test (gate) |
| 16 | Flush-mine (fast push after realtime insert) | Bell client on INSERT event | Caller only | Push | Immediate | self-only + per-row business | `flush-mine/route.ts` | route audit |

**Client listeners:** `notification-bell.tsx` (realtime on `notifications`, RLS-limited to own rows; count RPC business-scoped), `notification-center.tsx` (list + mark-read business-scoped — cp44), `announcement-banner.tsx` (realtime filtered by business_id), `field-nudge-bell` (admin_notifications, RLS owner-only). Business switching: feed/count/mark-read all take the current `businessId` argument, so no state carries over; verified by T2/T4/T7.

---

## 3. Issues found and fixed

**Critical — cross-tenant:**
- **L1** `list_pending_pushes` / `mark_pushed` were executable by *any authenticated user* (SECURITY DEFINER + default PUBLIC execute). Any logged-in user could read pending notification titles/bodies/user_ids across **all** businesses, or mark everyone's pushes as sent (global suppression). → revoked from `public, authenticated, anon`; service-role only. Same for `fire_due_notifications`.
- **S1** `push_subscriptions.business_id` was client-asserted: any signed-in user could tag their own device onto ANY business (via `/api/notifications/subscribe` or direct PostgREST — RLS allowed it) and from then on receive that business's announcement/offer/broadcast pushes. → DB guard trigger `_push_sub_guard` (single enforcement point, applies to service-role writes too) + membership check in the subscribe route (clean 403). Existing violating rows are retagged to NULL (expected: zero).
- **S1b** Ex-members kept receiving business pushes forever — nothing deleted subscriptions on membership removal. → cleanup trigger on `business_memberships` delete (staff keep theirs).

**Correctness / timing:**
- **Q2** The 12-hour check-in reminder fired even when the user had left the business, or had checked in again (so "you can check in again" was false). → drain re-verifies membership and, for `check_in_available`, that the latest check-in is ≥12h old; stale rows are retired (fired_at stamped), never delivered, never re-scanned. A newer check-in now *reschedules* the pending reminder instead of being swallowed.
- **E1** `notify_expiring_redemptions`: callable by any authenticated user for any business (spam vector), and its 24h dedupe ignored `business_id` — an expiry notice in business A suppressed business B's warning for the same user. → staff-gated (machine callers exempt), dedupe scoped per business.
- **DUP1** Manager broadcasts and raffle winner/staff notifications were pushed **twice** (direct push + the per-minute cron re-pushing the unstamped rows). → `broadcast_notification` stamps `push_sent_at`; a stamp trigger covers the raffle kinds.
- **A1** `/api/notifications/award-event` accepted a `membership_id` without checking it belonged to the claimed business — staff of A could land an A-branded row on B's customer. → lookup now scoped by `business_id`.
- **P1** `/api/notifications/push-now` trusted raw `user_ids`. → filtered to verified members of the business.
- Queue enqueue was check-then-insert (double-queue race under concurrent check-ins). → partial unique index on pending `(user_id, dedupe_key)` + conflict-tolerant trigger; existing pending duplicates retired (earliest kept).
- `/api/notifications/announce-offer` had no rate limit (announce-message did). → added, same ceiling.

**Testability refactor (no behavior change):** the pure machine-auth gate moved to `lib/machine-secret.js` (+ `.d.ts`); `lib/api-auth.ts` re-exports the same API.

## 4. Files changed

- **NEW** `checkpoint-109-notification-hardening/cp109_notifications_hardening.sql` — the migration (apply in Supabase).
- **NEW** `checkpoint-109-notification-hardening/notification_isolation_test.sql` — DB test suite (transactional, rolls back, prod-safe).
- **NEW** `lib/machine-secret.js`, `lib/machine-secret.d.ts`, `tests/machine-secret.test.mjs`; `package.json` gains `npm test`.
- **MOD** `lib/api-auth.ts` (re-export split), `app/api/notifications/{subscribe,award-event,push-now,announce-offer}/route.ts`.

## 5. Not production-ready / not implemented (honest gaps)

- **Streak-expiration warnings do not exist.** No producer sends "your streak is about to expire" or "your streak expired". The streak page computes expiry client-side only. If you want it, it needs a queue producer keyed to `period_end` — say the word and it's a follow-up checkpoint.
- **Missed/overdue check-in:** only the manual win-back flow covers this; there is no automatic overdue notification.
- **`/api/admin-app/daily-nudge`** still uses its own (fail-closed-equivalent, but non-standard) auth check rather than `requireMachineSecret`; recipients are agency admins only, so exposure is internal. Left as-is deliberately (behavior-preserving); candidate for cleanup.
- **`business_announcements` is world-readable by design** (the banner shows pre-login in a business's own app). Not a leak — announcements are public-facing content — but managers should know they're not member-private.
- **Timezone note:** the 12h check-in reminder and queue math run in UTC intervals (duration-based, so TZ-safe). The daily-check "first of the day" trigger compares dates in UTC — a check-in at 5pm PT and another at 6pm PT next day can straddle a UTC boundary and both count as "first of day". Cosmetic (extra confirmation notif), unchanged.
- **At-least-once push:** if `process-pending` crashes between sending and `mark_pushed`, a duplicate push is possible on retry. This is the standard trade against dropped notifications; the batch is small (≤100) and the window is milliseconds.

## 6. Remaining assumptions

- CP-88's `CRON_SECRET` is set in Vercel and on the Supabase webhook header (push stops with 401s if not — visible in logs).
- The CP-51 rule stands: one device receives one business's pushes per origin; the real per-tenant fix remains subdomains.
- `cp42_checkin_available_notif.sql`, `cp37_12_push_pending.sql`, `cp32`, `cp44_security` are applied on prod (the isolation suite will say so loudly if not — missing-migration checks are the first thing it hits).

## 7. Manual testing checklist

1. **Apply SQL → run `notification_isolation_test.sql`** in Supabase; expect the ✅ notice.
2. Two phones, two businesses (A and B), one customer account in each:
   - Manager A sends an announcement → only phone A rings; B's bell shows nothing.
   - Open business B's app with A's account (if enrolled in both): bell count and feed show only B's items; mark-all-read in B leaves A's unread intact.
3. **Subscription hijack (the S1 fix):** as customer of A only, call `POST /api/notifications/subscribe` with business B's id in the payload → expect **403 "not a member of this business"**.
4. **Leave-business:** remove a test member from business A (front desk), then send an A announcement → their phone stays silent.
5. **Check-in reminder:** check in as a test member; 12h later expect one "check in again / spin ready" push. Check in again at hour 11 (front-desk award) → the reminder should arrive ~12h after the second check-in, not the first.
6. **Broadcast dedupe:** send a manager broadcast → each phone rings exactly once (watch for a duplicate ~60s later; there must be none).
7. **Cron gates:** `curl /api/notifications/process-pending` with no header → 401 (or 503 if CRON_SECRET unset). With header → JSON `{ok:true,...}`.
8. `npm test` → 5/5 pass.
