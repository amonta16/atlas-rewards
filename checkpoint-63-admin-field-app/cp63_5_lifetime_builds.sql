-- =====================================================================
-- CHECKPOINT 63.3 — lifetime "apps built" counter per rep
-- =====================================================================
-- Tracks how many apps each account has EVER built — a true lifetime tally
-- that only goes up. Unlike counting existing businesses.created_by (which
-- drops when an app is deleted), this survives deletions/reassignments.
--
-- The mobile + desktop leaderboards already show a "built" number, so once
-- this runs they automatically reflect the lifetime count — no redeploy.
--
-- Apply in the Supabase SQL editor. Idempotent — safe to re-run.
-- (Self-contained: works even if cp63_3 wasn't applied.)
-- =====================================================================


-- Defensive: make sure the creator column exists (from cp63_3).
alter table public.businesses
  add column if not exists created_by uuid references auth.users(id) on delete set null;
create index if not exists businesses_created_by_idx on public.businesses(created_by);


-- =====================================================================
-- 1. rep_build_stats — the monotonic lifetime counter
-- =====================================================================
create table if not exists public.rep_build_stats (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  lifetime_apps_built int not null default 0,
  updated_at         timestamptz not null default now()
);

-- Backfill from the apps that currently exist (one-time baseline). After
-- this, every new build increments and deletions never subtract.
insert into public.rep_build_stats (user_id, lifetime_apps_built)
select created_by, count(*)
  from public.businesses
 where created_by is not null
 group by created_by
on conflict (user_id) do nothing;

alter table public.rep_build_stats enable row level security;
drop policy if exists rep_build_stats_admin_read on public.rep_build_stats;
create policy rep_build_stats_admin_read on public.rep_build_stats
  for select using (public.is_agency_admin());
-- Writes happen only inside create_business (SECURITY DEFINER).


-- =====================================================================
-- 2. create_business — stamp creator + bump the lifetime counter
-- =====================================================================
create or replace function public.create_business(
  p_name           text,
  p_slug           text,
  p_industry       text     default null,
  p_widget_config  jsonb    default null,
  p_point_rules    jsonb    default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id   uuid;
  v_slug citext := lower(regexp_replace(p_slug, '[^a-z0-9-]+', '-', 'gi'));
begin
  if not public.is_agency_staff() then
    raise exception 'only agency admins or VAs can create businesses';
  end if;
  if v_slug = '' or length(v_slug) < 2 then
    raise exception 'slug must be at least 2 characters';
  end if;
  if exists (select 1 from public.businesses where slug = v_slug) then
    raise exception 'slug "%" is already taken', v_slug;
  end if;

  insert into public.businesses (slug, name, industry, status, widget_config, point_rules, created_by)
       values (
         v_slug, p_name, p_industry, 'active',
         coalesce(p_widget_config,
           (select column_default::jsonb from information_schema.columns
             where table_schema = 'public' and table_name = 'businesses'
               and column_name = 'widget_config')),
         coalesce(p_point_rules,
           (select column_default::jsonb from information_schema.columns
             where table_schema = 'public' and table_name = 'businesses'
               and column_name = 'point_rules')),
         auth.uid()
       )
    returning id into v_id;

  -- Lifetime tally — increments forever, never decremented on delete.
  insert into public.rep_build_stats (user_id, lifetime_apps_built)
  values (auth.uid(), 1)
  on conflict (user_id) do update
     set lifetime_apps_built = public.rep_build_stats.lifetime_apps_built + 1,
         updated_at = now();

  return v_id;
end; $$;
grant execute on function public.create_business(text, text, text, jsonb, jsonb) to authenticated;


-- =====================================================================
-- 3. rep_leaderboard v3 — "built" now = lifetime count
-- =====================================================================
drop function if exists public.rep_leaderboard();

create function public.rep_leaderboard()
returns table (
  user_id                   uuid,
  email                     text,
  full_name                 text,
  apps_created              int,   -- LIFETIME built
  apps_sold                 int,
  claimed_count             int,
  sold_mrr_cents            bigint,
  monthly_commission_cents  bigint
)
language sql stable security definer set search_path = public as $$
  with def as (select coalesce(default_commission_pct, 30) d from public.admin_app_config where id = 1),
  reps as (
    select created_by as uid from public.businesses where created_by is not null
    union select claimed_by from public.businesses where claimed_by is not null
    union select user_id    from public.rep_build_stats           -- keep reps whose apps were all deleted
  )
  select r.uid, p.email, p.full_name,
    coalesce(
      (select lifetime_apps_built from public.rep_build_stats s where s.user_id = r.uid),
      (select count(*) from public.businesses b where b.created_by = r.uid)
    )::int,
    (select count(*) from public.businesses b where b.claimed_by = r.uid and b.deal_stage = 'won')::int,
    (select count(*) from public.businesses b where b.claimed_by = r.uid)::int,
    (select coalesce(sum(coalesce(b.deal_mrr_cents,0)),0)
       from public.businesses b where b.claimed_by = r.uid and b.deal_stage = 'won')::bigint,
    (select coalesce(sum(round(coalesce(b.deal_mrr_cents,0)
              * coalesce(b.commission_pct, (select d from def)) / 100.0)),0)
       from public.businesses b where b.claimed_by = r.uid and b.deal_stage = 'won')::bigint
  from (select distinct uid from reps) r
  join public.profiles p on p.id = r.uid
  where public.is_agency_admin()
  order by 8 desc, 5 desc, 4 desc;
$$;
grant execute on function public.rep_leaderboard() to authenticated;


-- =====================================================================
-- 4. team_mrr_summary — team "apps built" = sum of lifetime counters
-- =====================================================================
create or replace function public.team_mrr_summary()
returns table (
  team_mrr_cents        bigint,
  team_commission_cents bigint,
  apps_created          int,   -- LIFETIME built across the team
  apps_sold             int,
  active_reps           int
)
language sql stable security definer set search_path = public as $$
  with def as (select coalesce(default_commission_pct, 30) d from public.admin_app_config where id = 1)
  select
    coalesce(sum(case when b.deal_stage = 'won' then coalesce(b.deal_mrr_cents,0) end),0)::bigint,
    coalesce(sum(case when b.deal_stage = 'won'
      then round(coalesce(b.deal_mrr_cents,0) * coalesce(b.commission_pct, (select d from def))/100.0) end),0)::bigint,
    greatest(
      coalesce((select sum(lifetime_apps_built) from public.rep_build_stats), 0),
      count(*) filter (where b.created_by is not null)
    )::int,
    count(*) filter (where b.deal_stage = 'won')::int,
    (select count(distinct uid) from (
       select created_by uid from public.businesses where created_by is not null
       union select claimed_by from public.businesses where claimed_by is not null
       union select user_id    from public.rep_build_stats
     ) x)::int
  from public.businesses b
  where public.is_agency_admin();
$$;
grant execute on function public.team_mrr_summary() to authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- CP-63.3 done. Supabase-only — no redeploy needed; the leaderboards
-- already render the "built" number this returns.
-- =====================================================================
