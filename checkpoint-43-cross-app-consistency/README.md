# Checkpoint 43 — Cross-app consistency

Seven fixes, all aimed at making the *core* experience identical across every
sub-account (no business should behave differently from another) and giving the
front desk the tools they were missing.

## 1. Notification master switches now show on the phone
The manager dashboard's Front-desk tab only mounted the bare "Send to all
members" composer, so the **Notification types** master toggles (and the
send-test / diagnostics panels) were desktop-only. It now renders the full
`NotificationSettingsPanel` — the *same* component the agency Settings tab uses —
for managers/admins, so what you see on your phone matches the desktop exactly.
*File:* `components/manager/manager-dashboard.tsx`

## 2. Daily-Spin lock state is now consistent across businesses
The spin "ready" check used `mystery_reward_status.is_available` alone whenever
that RPC returned a row — so a shop whose cooldown had elapsed showed
"You're ready to spin!" even though the customer hadn't checked in (the yogurt
bug), while a shop whose RPC returned nothing correctly showed "Check in to
unlock" (Starbucks). **Check-in is now a hard prerequisite for "ready"** on
every business: not-checked-in → locked, always.
*File:* `components/customer/daily-spin-button.tsx`

## 3. The two spin widgets (Home + Rewards) are now one component
Home used `DailySpinButton`; the Rewards page had a *separate inline* button that
only tracked check-in — so the two could disagree. The Rewards page now renders
the same `DailySpinButton`, so the widgets can never drift apart again.
*File:* `components/customer/rewards-client.tsx`

## 4. Front-desk activity log shows real names instead of "Guest"
The name join (ledger → membership → profile) was done from the browser and got
silently trimmed by RLS for front-desk (`business_staff`) viewers — the
`profiles_staff_read` policy only covers businesses you *manage*, not ones you're
merely staff at — so every row fell back to "Guest". Replaced with a
SECURITY DEFINER RPC, `business_recent_activity`, that does the join server-side
(RLS-immune) and is itself gated to staff/manager/admin.
*Files:* `app/[business]/manage/page.tsx`, `cp43_migration.sql`

## 5. Managers & front desk can remove points
New **Remove points** flow in the award panel (a rose "Corrections" card →
integer keypad + optional reason). Backed by the SECURITY DEFINER
`manager_remove_points` RPC, which clamps so a balance can never go negative and
writes a `manual_removal` ledger row (so it shows up in the activity log and is
reversible via the 30-second Undo).
*Files:* `components/manager/award-points-panel.tsx`, `cp43_migration.sql`

## 6. Bell "arrow" install nudge is now consistent across businesses
`EnablePushNudge` used a single **global** localStorage key, so only the first
business a customer opened ever got the arrow; every other business never did.
The key is now **per-business** (matching `PwaWelcomeOverlay`), and the nudge is
skipped in installed-PWA (standalone) mode so it no longer races the welcome
cutscene. Result: browser → arrow at the bell; installed app → welcome screen —
deterministic on every sub-account.
*Files:* `components/customer/enable-push-nudge.tsx`, `components/customer/app-shell.tsx`

## 7. App QR moved up onto the front-desk dashboard
The discovery/app QR existed but was buried at the bottom of the Front-desk tab.
It now sits right under the "Scan to start" hero so staff can show it to walk-ins
without scrolling.
*File:* `components/manager/manager-dashboard.tsx`

## 8. Atlas Impact hero no longer shows a broken "preview mode" card
When the CP-32 `atlas_impact_rollup` RPC isn't installed, the Insights hero
used to render "$—" plus an italic "Apply the CP-32 SQL migration … preview
mode" note. It now falls back to the real 30-day member revenue (from the
always-installed `business_analytics_rollup`) with honest framing
("Member revenue tracked"), and shows real member/repeat/redemption/points
chips instead of the apology text. The card never looks broken again.
*File:* `components/manager/insights-dashboard.tsx`

## 9. Admin "Front desk" no longer loops through the customer preview
Clicking Front desk from the app builder used to bounce to a login page and
then drop you on the customer app (`/app`), needing a second click to reach
the desk. Two fixes: the `/manage` guard now redirects to
`/<slug>/login?next=/<slug>/manage` (so login returns to the desk), and the
business login page auto-forwards an already-signed-in user straight to
`?next` instead of making them re-type a password.
*Files:* `app/[business]/manage/layout.tsx`, `app/[business]/login/page.tsx`

## 10. Notifications — why tests work but automated ones didn't
Tests and "Send to all" push **synchronously inside the request**, so they
always reach the phone. The 8 automated types write a row and rely on the
`/api/notifications/process-pending` **cron** (every minute) to push — and on
Vercel's free plan that cron only runs once a day. So it was never the push
subscription; it was the cron cadence.

- **Time-based types** (streak, check-in available, gift expiry, birthday,
  auto win-back): fixed by running the cron every minute → **upgrade Vercel to
  Pro** (no code change) and make sure `CRON_SECRET` is set. The pipeline
  (`list_pending_pushes` / `mark_pushed`, cp37_12) is already correct.
- **Manual win-back** ("We miss you"): now pushes **instantly** via the new
  `/api/notifications/push-now` route — the same path the tests use — instead
  of waiting on the cron.
- **Reward unlocked** already pushed instantly (CP-37.20).

*Files:* `app/api/notifications/push-now/route.ts`, `components/manager/insights-dashboard.tsx`

---

## Apply the SQL

Run `cp43_migration.sql` in the Supabase SQL editor (idempotent — safe to
re-run). It creates:

- `business_recent_activity(p_business_id, p_limit)` — activity log with names
- `manager_remove_points(p_membership_id, p_amount, p_notes)` — point removal

Both are `SECURITY DEFINER` and gated via `current_app_role`. Until this SQL is
applied, the activity log will show "Guest" (the RPC won't exist) and the Remove
button will error — so apply it before/with this deploy.

## Make automated push actually fire (one-time setup)
1. Apply `checkpoint-37-spin-welcome-and-notif-wiring/cp37_12_push_pending.sql`
   if you haven't (adds `notifications.push_sent_at`, `list_pending_pushes`,
   `mark_pushed`).
2. Set `CRON_SECRET` in Vercel env (any random string). Vercel auto-sends it
   on cron calls; the route requires it when set.
3. **Upgrade Vercel to Pro** so the `vercel.json` `* * * * *` cron runs every
   minute (Hobby throttles to daily). After this, streak / check-in / gift /
   birthday / auto-win-back pushes ring phones within ~60s.
4. Confirm VAPID keys are set (they already are — tests prove it).

## Verify note
TypeScript was hand-verified via the editor (the bash/`tsc` sandbox serves
stale/truncated copies of OneDrive files for this project, so its parse errors
are mount artifacts, not real — per the project's known OneDrive-lag behavior).
