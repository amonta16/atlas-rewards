-- ============================================================
-- CP-77: Native push (FCM) — schema
-- Run in Supabase SQL editor after cp75. Safe to re-run.
--
-- Native (Android/iOS) push tokens reuse push_subscriptions:
--   endpoint  = 'fcm:<device token>'   (web rows keep their https URL)
--   p256dh/auth = NULL                  (web-push crypto keys, N/A native)
--   platform  = 'android' | 'ios'       (web rows default 'web')
--
-- Why reuse the table: unique(user_id, endpoint) still dedupes, and the
-- CP-51 tenant boundary (business_id tag on the SUBSCRIPTION) keeps
-- working for native rows with zero changes to the fan-out queries.
-- BONUS over web push: native tokens are per-APP, not per-origin, so
-- the CP-51 "one sub per device" limitation disappears on mobile.
-- ============================================================

alter table public.push_subscriptions
  alter column p256dh drop not null,
  alter column auth   drop not null;

alter table public.push_subscriptions
  add column if not exists platform text not null default 'web';

-- Re-runnable check constraint
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'push_subscriptions_platform_check'
  ) then
    alter table public.push_subscriptions
      add constraint push_subscriptions_platform_check
      check (platform in ('web', 'android', 'ios'));
  end if;
end $$;

-- Web rows must still carry their crypto keys.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'push_subscriptions_web_keys_check'
  ) then
    alter table public.push_subscriptions
      add constraint push_subscriptions_web_keys_check
      check (platform <> 'web' or (p256dh is not null and auth is not null));
  end if;
end $$;
