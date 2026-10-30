# Checkpoint 25 — Enrollment hotfix + streak visibility + high-contrast Quick Actions

## ⚠️ Run the SQL first

Paste [`01_enrollment_hardening.sql`](./01_enrollment_hardening.sql) into the
Supabase SQL editor and Run. Idempotent — safe to re-run.

## What broke (Andrew's report)

1. New users sign up but their Scan tab is stuck on
   "Setting up your QR…" forever. Andrew's own account works.
2. Streak feature is "enabled" in the agency editor but the flame icon
   never appears in the customer header.
3. The header quick-action menu (Gift / Member / Streak icons) reads
   as static badges. Andrew asked for higher contrast & more clickable.

## What CP-25 ships

### 1. Self-healing enrollment (`01_enrollment_hardening.sql`)

- `enroll_member()` rewritten:
  - Drops the dependency on `gen_random_bytes()` (which silently fails
    when `pgcrypto` is missing). Uses `md5(random()::text || clock_timestamp())`
    instead — always available in stock Postgres.
  - On the early-return path (membership already exists), now **backfills
    `referral_code` if it's NULL**. This is the key fix — the CP-24 client
    polling kept calling `enroll_member` but the function short-circuited
    the moment it saw an existing row, leaving NULL codes stuck.
  - Welcome-bonus failures no longer block enrollment — wrapped in
    `BEGIN…EXCEPTION` so a bad point rule never bricks a signup.
- One-time backfill loop at the bottom — patches every existing
  membership row that has `referral_code IS NULL` so all the users
  Andrew already created get a QR right after applying the SQL.
- `create extension if not exists pgcrypto;` so future installs that
  still happen to have pgcrypto enabled benefit from it.

### 2. Streak icon visible the moment the agency enables streaks

`components/customer/header-actions.tsx`:
- Added an independent `streak_config` read that runs even before the
  member has a `member_streaks` row.
- New realtime subscription on `streak_config` keyed to the business so
  the icon appears the instant the agency saves the streak toggle.
- `streakEnabled` now = `get_streak_status.is_enabled OR streak_config.is_enabled`.
  Previously it was only the RPC, which returns `is_enabled:false` until
  the member's first check-in created a `member_streaks` row.

### 3. High-contrast Quick Actions

`components/customer/header-actions.tsx` +
`components/customer-preview/customer-preview.tsx`:
- The three header buttons are now 40px filled tiles with **white icons
  on a brand-gradient background**, plus a shadow + ring-1 + active-scale.
- Mystery / Gift: brand-tinted when locked, full brand gradient + white
  icon once the daily check-in is done.
- Membership: gold gradient for paid members, brand gradient for
  non-members — was a pale wash before.
- Streak: orange-to-red fire gradient with a white flame icon — pops
  against the white header bar.
- Admin phone preview mirrors the same visual language so the agency
  sees what the customer will see.

## Files touched

```
checkpoint-25-enrollment-and-streak/01_enrollment_hardening.sql        (new)
checkpoint-25-enrollment-and-streak/README.md                          (this file)
components/customer/header-actions.tsx                                 (streak source-of-truth + filled buttons)
components/customer-preview/customer-preview.tsx                       (matching high-contrast preview header)
```

## To verify after running the SQL

1. Reload the customer Atlas tab in your browser.
2. Sign up a brand-new throwaway account at
   `frozen-yogurt.lvh.me:3000/signup` → confirm the Scan tab shows the QR
   immediately. Existing stuck users will also see their QR appear
   on next reload.
3. In the agency Brand Editor → Rewards tab → Streaks: toggle on, click
   Save. Switch to the customer tab — flame icon shows in the header
   within a second (realtime).
4. Tap any header icon — they're filled tiles now, with the right brand
   gradient, and they pop off the white header.
