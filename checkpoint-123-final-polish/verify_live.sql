-- =====================================================================
-- Atlas · LAUNCH VERIFICATION (read-only, one query, one result grid)
-- Run in Supabase SQL Editor after applying cp121 + cp122 + cp123.
-- Every row should say OK; any MISSING row = that checkpoint's SQL
-- hasn't been applied (this project has a documented history of drift).
-- =====================================================================
with checks as (
  select 1 as ord, 'cp121: member_streak_gifts table' as item,
         (to_regclass('public.member_streak_gifts') is not null) as ok
  union all select 2, 'cp121: claim_streak_gift()',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='claim_streak_gift')
  union all select 3, 'cp121: list_streak_gifts()',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='list_streak_gifts')
  union all select 4, 'cp122: unlock trigger filters hidden rewards',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='_notif_reward_unlocked'
                    and pg_get_functiondef(p.oid) ilike '%show_in_store%')
  union all select 5, 'cp122: unlock trigger rows are bell-only (stamped)',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='_notif_reward_unlocked'
                    and pg_get_functiondef(p.oid) ilike '%push_sent_at%')
  union all select 6, 'cp123: Fourth of July template',
         exists (select 1 from public.automated_offer_templates where slug='fourth_of_july')
  union all select 7, 'cp123: Custom Occasion template',
         exists (select 1 from public.automated_offer_templates where slug='custom_occasion')
  union all select 8, 'cp123: custom_trigger_config column',
         exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='business_automated_offers'
                    and column_name='custom_trigger_config')
  union all select 9, 'cp123: engine honors per-business date',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='trigger_automated_offers'
                    and pg_get_functiondef(p.oid) ilike '%custom_trigger_config%')
  union all select 10, 'cp120: demo flag on memberships',
         exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='business_memberships'
                    and column_name='is_demo')
  union all select 11, 'raffles: cp85 tables live',
         (to_regclass('public.raffles') is not null and to_regclass('public.raffle_entries') is not null)
  union all select 12, 'raffles: enter/finalize functions live',
         (select count(*) = 3 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public'
             and p.proname in ('enter_raffle','finalize_due_raffles','list_active_raffles'))
  union all select 13, 'raffles: no draws stuck past their deadline',
         -- an ACTIVE raffle whose end time passed >1h ago means the
         -- finalize sweep isn't draining it (it runs every 5 minutes)
         not exists (select 1 from public.raffles
                      where status = 'active' and ends_at < now() - interval '1 hour')
  union all select 14, 'reviews: Exotic has a Google review link',
         exists (select 1 from public.businesses
                  where slug='exotic' and coalesce(google_review_url,'') <> '')
  union all select 15, 'automations: pg_cron installed (offers engine needs a scheduler)',
         exists (select 1 from pg_extension where extname = 'pg_cron')
)
select item, case when ok then '✅ OK' else '❌ MISSING / CHECK' end as status
  from checks order by ord;
