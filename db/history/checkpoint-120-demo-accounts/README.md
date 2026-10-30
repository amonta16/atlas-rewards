# CP-120 — Demo accounts + reset, clean analytics, double-push fix, Streaks "!" badge

## Apply order

1. **Supabase → SQL Editor: run `cp120_migration.sql`** (after cp118).
2. **Deploy the app** (git push — files are already in the repo).

Both halves are safe in either order, but the desk demo/reset buttons need
the SQL to actually work.

## What's in it

**1. Demo accounts (managers + agency only).** New `is_demo` flag on
memberships. On the front-desk member panel (below the password section)
managers get a **Demo account** toggle and a **Reset account** button —
front-desk PIN staff see neither, and the RPCs enforce the same gate
server-side. The Users directory shows a violet **DEMO** chip next to
flagged accounts (VIP chip pattern).

**2. Analytics stay clean.** Every analytics RPC now excludes demo
members' activity server-side: `manager_daily_recap`,
`business_analytics_rollup`, `business_analytics`,
`business_daily_activity`, `top_members`, `top_loyal_members`,
`atlas_impact_rollup`, `atlas_impact_monthly`, `atlas_review_funnel`.
Mark your test account demo and Insights / Atlas Impact / revenue charts /
recap / leaderboards ignore it from that moment on. (Win-back and
inactive lists intentionally still include demo accounts so those flows
stay testable — per Andrew's call.) Functions were dropped and recreated
at their latest shipped shapes with citext casts (CP-118 lesson) and
re-granted.

**3. Reset account.** `reset_member_account(membership)` wipes the
member's points ledger, check-ins, streak row, redemptions, saved gifts,
spend events, spins, raffle entries, and this business's notifications,
then zeroes balance / lifetime points / visits. The account, login, and
QR code survive — it's day one again. Two-step inline confirm in the UI;
returns a summary of what was cleared.

**4. Double-notification fix.** `/api/notifications/push-fanout` (the
Supabase webhook) now skips rows already stamped `push_sent_at` and
stamps rows after sending — so the webhook and the per-minute cron can't
both push the same notification, and pre-stamped announcement rows
aren't re-sent. This was invisible while iOS delivery was down (CP-119
APNs credential outage) and surfaced the moment it came back.

**5. Streaks tab "!" badge.** When a member's streak goes up (desk
check-in) and they haven't looked at the Streaks tab since, the tab
wears the same wobbling red "!" as the review nudge. Opening the tab
records the seen value (device-local, same pattern as the bell nudge)
and clears it. Silent no-op wherever streaks are disabled.

## Files changed (in the repo)

- `app/api/notifications/push-fanout/route.ts` — dedupe skip + stamp
- `components/customer/app-shell.tsx` — `useStreakNudge` + Streaks badge
- `components/manager/member-demo-tools.tsx` — NEW: toggle + reset UI
- `components/manager/award-points-panel.tsx` — renders MemberDemoTools
- `components/manager/members-directory.tsx` — DEMO chip
- `checkpoint-120-demo-accounts/cp120_migration.sql` — the SQL

## Verified

- SQL: scratch Postgres (with citext) — staff caller blocked from
  toggle/reset; after marking demo, all nine analytics RPCs exclude the
  demo member's activity (checked each one); reset wipes ledger,
  check-ins, spins, raffle entries and zeroes counters while keeping the
  account; migration is transactional and re-runnable.
- App: full cloud-mirror `tsc --noEmit` (npm ci from the lockfile) —
  **0 errors**.

## Notes

- A tiny double-push window technically remains (webhook and cron reading
  the same row in the same second) — in practice the stamp closes it;
  CP-110's R3 (reward_unlocked trigger firing 3×) is a separate known
  item and not addressed here.
- The Streaks badge is per-device (localStorage), matching the bell
  nudge; a member switching phones sees the badge once more — harmless.
