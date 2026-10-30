-- =====================================================================
-- CHECKPOINT 63.1 — creator tracking + richer leaderboard + team MRR
-- =====================================================================
-- Adds to Atlas Command:
--   • businesses.created_by — who built each app (set on create going fwd).
--   • rep_leaderboard v2 — apps created, apps sold (won), MRR + commission.
--   • team_mrr_summary() — the whole group's MRR + totals for a hero card.
--
-- Apply AFTER cp63_2_nudges.sql. Idempotent.
-- =====================================================================


-- =====================================================================
-- 1. businesses.created_by  (who built the app)
-- =====================================================================
alter table public.businesses
  add column if not exists created_by uuid references auth.users(id) on delete set null;
create index if not exists businesses_created_by_idx on public.businesses(created_by);
-- Historical rows stay NULL (we can't know who built them); new apps get
-- stamped by create_business below.


-- =====================================================================
-- 2. create_business — stamp created_by = the caller
-- =====================================================================
-- Same body as cp62.1 (is_agency_staff gate) + the created_by stamp.
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

  return v_id;
end; $$;
grant execute on function public.create_business(text, text, text, jsonb, jsonb) to authenticated;


-- =====================================================================
-- 3. rep_leaderboard v2 — created / sold / MRR / commission per rep
-- =====================================================================
-- One row per person who has EITHER created or claimed at least one app.
--   apps_created  = businesses they built
--   apps_sold     = businesses they claimed that are marked 'won'
--   claimed_count = businesses they claimed (any stage)
--   sold_mrr_cents= sum of deal MRR on their won deals (their MRR contribution)
--   monthly_commission_cents = their cut of that (effective %)
-- =====================================================================
drop function if exists public.rep_leaderboard();

create function public.rep_leaderboard()
returns table (
  user_id                   uuid,
  email                     text,
  full_name                 text,
  apps_created              int,
  apps_sold                 int,
  claimed_count             int,
  sold_mrr_cents            bigint,
  monthly_commission_cents  bigint
)
language sql stable security definer set search_path = public as $$
  with def as (select coalesce(default_commission_pct, 30) d from public.admin_app_config where id = 1),
  reps as (
    select created_by as uid from public.businesses where created_by is not null
    union
    select claimed_by from public.businesses where claimed_by is not null
  )
  select r.uid, p.email, p.full_name,
    (select count(*) from public.businesses b where b.created_by = r.uid)::int,
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
-- 4. team_mrr_summary — the whole group's numbers (hero card)
-- =====================================================================
create or replace function public.team_mrr_summary()
returns table (
  team_mrr_cents        bigint,   -- sum of deal MRR on all WON deals
  team_commission_cents bigint,   -- total commission owed across won deals
  apps_created          int,
  apps_sold             int,
  active_reps           int
)
language sql stable security definer set search_path = public as $$
  with def as (select coalesce(default_commission_pct, 30) d from public.admin_app_config where id = 1)
  select
    coalesce(sum(case when b.deal_stage = 'won' then coalesce(b.deal_mrr_cents,0) end),0)::bigint,
    coalesce(sum(case when b.deal_stage = 'won'
      then round(coalesce(b.deal_mrr_cents,0) * coalesce(b.commission_pct, (select d from def))/100.0) end),0)::bigint,
    count(*) filter (where b.created_by is not null)::int,
    count(*) filter (where b.deal_stage = 'won')::int,
    (select count(distinct uid) from (
       select created_by uid from public.businesses where created_by is not null
       union select claimed_by from public.businesses where claimed_by is not null
     ) x)::int
  from public.businesses b
  where public.is_agency_admin();
$$;
grant execute on function public.team_mrr_summary() to authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- CP-63.1 done. Apply after cp63_2_nudges.sql.
-- =====================================================================
