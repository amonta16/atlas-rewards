-- =====================================================================
-- Atlas · CP-119 — push-notification pipeline DIAGNOSTIC (read-only)
-- =====================================================================
-- Symptom: no phone pushes at all — streak-up notifications AND manager
-- announcements. Announcements push synchronously (no cron), streak
-- nudges go through the per-minute cron; both dead points at the shared
-- layer: device subscriptions, or push credentials, or the producers.
--
-- Run the WHOLE file in Supabase → SQL Editor. It changes nothing.
-- Each section is labeled; send me the output and I'll pinpoint the fix.
-- =====================================================================

-- ── A. Is the phone even subscribed? ─────────────────────────────────
-- Expect at least one row per device per business. endpoint_type:
--   'native (FCM)' = the installed iOS/Android app
--   'web push'     = PWA / browser subscription
-- If this is EMPTY (or your business is missing), the phone lost its
-- subscription (CP-91 class) — nothing can be delivered until the app
-- re-registers.
select 'A. push_subscriptions' as section,
       b.name as business,
       case when ps.endpoint like 'fcm:%' then 'native (FCM)' else 'web push' end as endpoint_type,
       ps.user_id,
       ps.created_at
  from public.push_subscriptions ps
  left join public.businesses b on b.id = ps.business_id
 order by ps.created_at desc
 limit 25;

-- ── B. Are notification rows being PRODUCED? ─────────────────────────
-- Recent rows in the bell table. If streak/reward rows appear here with
-- push_sent_at = NULL and never flip, the CRON isn't running (CRON_SECRET
-- missing/wrong in Vercel, or the per-minute cron isn't firing).
-- If reward/streak rows DON'T appear at all after a check-in, the DB
-- trigger (_notif_reward_unlocked / cp42 streak wiring) is missing.
select 'B. recent notifications' as section,
       kind, title,
       created_at,
       push_sent_at is not null as pushed,
       push_sent_at
  from public.notifications
 order by created_at desc
 limit 25;

-- ── C. Unpushed backlog ──────────────────────────────────────────────
-- >0 and growing = the cron drain is not running or failing.
select 'C. unpushed backlog' as section,
       count(*) as rows_waiting_for_push,
       min(created_at) as oldest_waiting
  from public.notifications
 where push_sent_at is null;

-- ── D. Reminder queue (12h streak / check-in nudges) ─────────────────
-- Due rows piling up = fire_due_notifications isn't being drained
-- (CP-116's cron change not deployed, or cron auth failing).
select 'D. notification_queue' as section,
       count(*) filter (where due_at <= now()) as due_now,
       count(*) as total_queued,
       min(due_at) as oldest_due
  from public.notification_queue;

-- ── E. Do the pipeline functions/triggers actually exist on live? ────
-- All four functions should be listed; missing = migration drift
-- (apply the checkpoint SQL that defines them).
select 'E. functions' as section, p.proname
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('fire_due_notifications','list_pending_pushes','mark_pushed',
                     'set_business_announcement','broadcast_notification');

-- The reward-unlocked trigger must sit on business_memberships, and no
-- leftover cp37 push-fanout trigger should still be on notifications.
select 'E2. triggers' as section,
       t.tgname, c.relname as on_table
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
 where not t.tgisinternal
   and c.relname in ('business_memberships','notifications','checkins')
 order by c.relname, t.tgname;

-- ── F. Announcements written? ────────────────────────────────────────
-- Your recent desk announcements should be here (the banner half works
-- independently of push). If rows exist but no phone buzz, the failure
-- is purely in the push layer (A + Vercel env), not the composer.
select 'F. business_announcements' as section,
       business_id, left(message, 40) as message, updated_at
  from public.business_announcements
 order by updated_at desc
 limit 10;

-- =====================================================================
-- WHILE THAT RUNS — check these three things in Vercel (Settings →
-- Environment Variables on the production project):
--   1. CRON_SECRET            — must exist. Without it the per-minute
--                               notification cron is rejected (fails
--                               closed since CP-88) and queued pushes
--                               never send.
--   2. VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY — web/PWA push credentials.
--   3. FIREBASE_SERVICE_ACCOUNT — native app (FCM) push credential.
--                               If your phone rows in section A say
--                               'native (FCM)' and this env is missing
--                               or was rotated, native pushes are
--                               silently skipped — and the CP-99
--                               dedupe also suppresses web push for
--                               those users, so they get NOTHING.
-- Then: Vercel → your project → Logs, filter "process-pending" — look
-- for "rejected", "VAPID keys missing", "[fcm] FIREBASE_SERVICE_ACCOUNT
-- missing", or "queue drain failed".
-- =====================================================================
