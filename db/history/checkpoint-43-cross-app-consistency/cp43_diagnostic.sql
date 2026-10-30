-- =====================================================================
-- CP-43 DIAGNOSTIC — read-only. Safe to run anytime.
-- =====================================================================
-- Run this in the Supabase SQL editor and paste the WHOLE result table
-- back to Claude. It reports which critical objects exist in your live
-- database so we know exactly which migrations still need to be applied
-- (instead of guessing or re-running all 76 SQL files).
--
-- Nothing is created, altered, or deleted. Pure SELECT.
-- =====================================================================

with checks(object_name, kind, present) as (
  -- ── Tables ─────────────────────────────────────────────────────────
  select 'profiles', 'table', to_regclass('public.profiles') is not null
  union all select 'business_memberships','table', to_regclass('public.business_memberships') is not null
  union all select 'points_ledger','table', to_regclass('public.points_ledger') is not null
  union all select 'rewards','table', to_regclass('public.rewards') is not null
  union all select 'offers','table', to_regclass('public.offers') is not null
  union all select 'notifications','table', to_regclass('public.notifications') is not null
  union all select 'push_subscriptions','table', to_regclass('public.push_subscriptions') is not null
  union all select 'business_notification_settings','table', to_regclass('public.business_notification_settings') is not null
  union all select 'business_automated_offers','table', to_regclass('public.business_automated_offers') is not null

  -- ── Critical columns ────────────────────────────────────────────────
  union all select 'notifications.push_sent_at','column',
    exists(select 1 from information_schema.columns
            where table_schema='public' and table_name='notifications' and column_name='push_sent_at')
  union all select 'profiles.full_name','column',
    exists(select 1 from information_schema.columns
            where table_schema='public' and table_name='profiles' and column_name='full_name')
  union all select 'profiles.birthday','column',
    exists(select 1 from information_schema.columns
            where table_schema='public' and table_name='profiles' and column_name='birthday')
  union all select 'business_notification_settings.customer_offer_announcements','column',
    exists(select 1 from information_schema.columns
            where table_schema='public' and table_name='business_notification_settings' and column_name='customer_offer_announcements')

  -- ── Functions (notifications + CP-43) ───────────────────────────────
  union all select 'business_recent_activity','function (CP-43, fixes Guest)', exists(select 1 from pg_proc where proname='business_recent_activity')
  union all select 'manager_remove_points','function (CP-43, remove points)', exists(select 1 from pg_proc where proname='manager_remove_points')
  union all select 'list_pending_pushes','function (cp37_12, cron push)', exists(select 1 from pg_proc where proname='list_pending_pushes')
  union all select 'mark_pushed','function (cp37_12, cron push)', exists(select 1 from pg_proc where proname='mark_pushed')
  union all select 'get_business_notification_settings','function (cp32/cp36)', exists(select 1 from pg_proc where proname='get_business_notification_settings')
  union all select 'update_business_notification_settings','function (cp32/cp36)', exists(select 1 from pg_proc where proname='update_business_notification_settings')
  union all select 'broadcast_notification','function (cp32, Send-to-all)', exists(select 1 from pg_proc where proname='broadcast_notification')
  union all select 'send_winback','function (we-miss-you)', exists(select 1 from pg_proc where proname='send_winback')
  union all select 'atlas_impact_rollup','function (cp32, Insights hero)', exists(select 1 from pg_proc where proname='atlas_impact_rollup')
  union all select 'business_analytics_rollup','function (Insights ops)', exists(select 1 from pg_proc where proname='business_analytics_rollup')
  union all select 'award_points','function (core)', exists(select 1 from pg_proc where proname='award_points')
  union all select 'member_checkin','function (check-in)', exists(select 1 from pg_proc where proname='member_checkin')
  union all select 'mystery_reward_status','function (daily spin)', exists(select 1 from pg_proc where proname='mystery_reward_status')
  union all select 'current_app_role','function (roles)', exists(select 1 from pg_proc where proname='current_app_role')
  union all select 'staffs_business','function (push perms)', exists(select 1 from pg_proc where proname='staffs_business')

  -- ── Triggers ────────────────────────────────────────────────────────
  union all select 'trg_notif_reward_unlocked','trigger (reward push)', exists(select 1 from pg_trigger where tgname='trg_notif_reward_unlocked')
)
select
  object_name as "Object",
  kind        as "What it's for",
  case when present then '✅ present' else '❌ MISSING' end as "Status"
from checks
order by present asc, kind, object_name;
