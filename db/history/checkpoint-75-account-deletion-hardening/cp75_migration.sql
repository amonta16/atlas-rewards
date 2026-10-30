-- ============================================================
-- CP-75: Account-deletion hardening + app_config version gate
-- Run in Supabase SQL editor. Safe to re-run.
--
-- WHY: CP-40's delete_my_account() ends with `delete from auth.users`.
-- Six foreign keys were created WITHOUT an on-delete action (Postgres
-- default = NO ACTION), so that delete THROWS for any customer who:
--   - was ever referred by someone (referrals.referee_user_id /
--     referee_membership_id), or
--   - is referenced as the actor on someone else's row
--     (points_ledger.created_by, redemptions.fulfilled_by,
--      reviews.verified_by, check_in_events.checked_in_by_user_id).
-- Apple/Google REQUIRE working in-app account deletion — a reviewer
-- hitting this error is a guaranteed rejection. Fix: retarget those
-- FKs to ON DELETE SET NULL (they're all nullable "who did it" /
-- "who was referred" audit fields — nulling on delete is correct).
--
-- Also: app_config — single-row table the mobile shell reads at boot
-- for the minimum-supported-build gate ("Please update") and an
-- emergency kill switch.
-- ============================================================

-- 1) Retarget NO ACTION FKs to ON DELETE SET NULL ---------------
-- Constraint names are looked up dynamically (they're auto-generated),
-- so this works regardless of what Postgres named them.
do $$
declare
  r record;
begin
  for r in
    select con.conname,
           rel.relname  as tbl,
           att.attname  as col,
           fnsp.nspname as ftbl_schema,
           frel.relname as ftbl,
           fatt.attname as fcol
    from pg_constraint con
    join pg_class rel      on rel.oid  = con.conrelid
    join pg_namespace nsp  on nsp.oid  = rel.relnamespace
    join pg_class frel     on frel.oid = con.confrelid
    join pg_namespace fnsp on fnsp.oid = frel.relnamespace
    cross join lateral unnest(con.conkey, con.confkey) as k(attnum, fattnum)
    join pg_attribute att  on att.attrelid  = rel.oid  and att.attnum  = k.attnum
    join pg_attribute fatt on fatt.attrelid = frel.oid and fatt.attnum = k.fattnum
    where nsp.nspname = 'public'
      and con.contype = 'f'
      and con.confdeltype = 'a'   -- NO ACTION only; leaves cascades alone
      and (rel.relname, att.attname) in (
        ('referrals',       'referee_user_id'),
        ('referrals',       'referee_membership_id'),
        ('points_ledger',   'created_by'),
        ('redemptions',     'fulfilled_by'),
        ('reviews',         'verified_by'),
        ('check_in_events', 'checked_in_by_user_id')
      )
  loop
    execute format('alter table public.%I drop constraint %I', r.tbl, r.conname);
    execute format(
      'alter table public.%I add constraint %I foreign key (%I) references %I.%I(%I) on delete set null',
      r.tbl, r.conname, r.col, r.ftbl_schema, r.ftbl, r.fcol
    );
    raise notice 'Retargeted FK % on %.% -> on delete set null', r.conname, r.tbl, r.col;
  end loop;
end $$;

-- 2) Harden delete_my_account() ---------------------------------
-- Same shape as CP-40, plus:
--   - staff guard: managers / front desk / agency roles must NOT nuke
--     themselves through the customer flow (their account is managed
--     from the Team tab). Clear error message instead of orphaned staff.
--   - explicit push_subscriptions cleanup (defensive; harmless if the
--     cascade already handles it).
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  if exists (select 1 from public.business_users where user_id = v_user) then
    raise exception 'Staff accounts can''t be deleted from the app. Ask your admin to remove you from the Team tab.';
  end if;

  delete from public.push_subscriptions where user_id = v_user;
  delete from public.business_memberships where user_id = v_user;
  delete from public.profiles where id = v_user;
  delete from auth.users where id = v_user;
end; $$;

grant execute on function public.delete_my_account() to authenticated;

-- 3) app_config — mobile shell boot gate ------------------------
create table if not exists public.app_config (
  id                  int primary key default 1 check (id = 1),  -- single row
  min_supported_build int not null default 0,   -- builds below this see the update wall
  latest_build        int not null default 0,   -- informational ("update available" nudge)
  update_message      text,                     -- optional copy for the update wall
  kill_switch         boolean not null default false,  -- emergency: block app entirely
  kill_message        text,
  updated_at          timestamptz not null default now()
);

insert into public.app_config (id) values (1) on conflict (id) do nothing;

alter table public.app_config enable row level security;

drop policy if exists app_config_read_all on public.app_config;
create policy app_config_read_all on public.app_config
  for select using (true);
-- No insert/update/delete policies: only the service role (dashboard /
-- SQL editor) can change it.

grant select on public.app_config to anon, authenticated;

-- ============================================================
-- Verify after applying:
--   1. In the customer app, Profile → Delete my account with a test
--      customer that HAS a referral row — should now succeed.
--   2. select * from app_config;  → one row, defaults.
-- ============================================================
