-- =====================================================================
-- CHECKPOINT 63.2 — twice-daily nudge schedule (9am & 1pm, DST-safe)
-- =====================================================================
-- Adds a timezone + a set of send-hours to the nudge config. The Vercel
-- Cron now runs hourly and the /api/admin-app/daily-nudge route only
-- actually sends when the current hour (in nudge_tz) is one of nudge_hours.
-- Defaults: 9 and 13 (1pm) in America/Los_Angeles — so the crew gets two
-- pokes a day, and DST is handled automatically (no fixed-UTC drift).
--
-- Apply AFTER cp63_3_leaderboard.sql. Idempotent.
-- =====================================================================

alter table public.admin_app_config
  add column if not exists nudge_tz    text  not null default 'America/Los_Angeles',
  add column if not exists nudge_hours  int[] not null default '{9,13}';

-- Make sure the singleton reflects the new defaults if they were NULL.
update public.admin_app_config
   set nudge_tz    = coalesce(nudge_tz, 'America/Los_Angeles'),
       nudge_hours = coalesce(nudge_hours, '{9,13}')
 where id = 1;

notify pgrst, 'reload schema';

-- =====================================================================
-- CP-63.2 done. Update vercel.json to run the cron hourly (0 * * * *)
-- and the route will fire only at 9am + 1pm in nudge_tz. See README.
-- =====================================================================
