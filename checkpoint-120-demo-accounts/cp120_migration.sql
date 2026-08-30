-- =====================================================================
-- Atlas · CP-120 — demo members, per-member reset, clean analytics
-- =====================================================================
-- 1. business_memberships.is_demo — mark test/demo accounts.
-- 2. set_member_demo(membership, bool)   — managers + agency only.
-- 3. reset_member_account(membership)    — managers + agency only: wipes
--    the member's activity (ledger, check-ins, streak, redemptions,
--    gifts, spend events, spins, raffle entries, notifications) and
--    zeroes the membership counters. For cleaning up test accounts.
-- 4. list_business_members gains an is_demo column (desk directory badge).
-- 5. Every analytics RPC now EXCLUDES demo members' rows, so playing
--    with a test account never skews Insights, Atlas Impact, revenue
--    charts, the review funnel, leaderboards, or the daily recap:
--    manager_daily_recap, business_analytics_rollup, business_analytics,
--    business_daily_activity, top_members, top_loyal_members,
--    atlas_impact_rollup, atlas_impact_monthly, atlas_review_funnel.
--    (inactive/win-back lists intentionally NOT filtered — demo accounts
--    stay usable for testing those flows, per Andrew's call.)
--
-- Functions are DROPPED and recreated at their latest shipped shape
-- (CP-118 lesson: live drift + return-shape changes), with explicit
-- ::text casts on citext columns, and re-GRANTed. Transactional,
-- safe to re-run. Run AFTER cp118.
-- =====================================================================

begin;

-- ── 1. demo flag ─────────────────────────────────────────────────────
alter table public.business_memberships
  add column if not exists is_demo boolean not null default false;

create index if not exists memberships_demo_idx
  on public.business_memberships (business_id) where is_demo;

-- ── 2. mark / unmark a member as demo (managers + agency only) ──────
create or replace function public.set_member_demo(p_membership_id uuid, p_is_demo boolean)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_business uuid;
begin
  select business_id into v_business
    from public.business_memberships where id = p_membership_id;
  if v_business is null then
    raise exception 'member not found';
  end if;
  if not public.is_business_manager(v_business) then
    raise exception 'permission denied — managers only' using errcode = '42501';
  end if;
  update public.business_memberships
     set is_demo = p_is_demo, updated_at = now()
   where id = p_membership_id;
  return p_is_demo;
end; $$;
grant execute on function public.set_member_demo(uuid, boolean) to authenticated;

-- ── 3. reset one member's activity (managers + agency only) ─────────
create or replace function public.reset_member_account(p_membership_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_m              record;
  v_ledger         int := 0;
  v_checkins       int := 0;
  v_redemptions    int := 0;
  v_gifts          int := 0;
  v_events         int := 0;
  v_notifications  int := 0;
begin
  select id, business_id, user_id into v_m
    from public.business_memberships where id = p_membership_id;
  if v_m.id is null then
    raise exception 'member not found';
  end if;
  if not public.is_business_manager(v_m.business_id) then
    raise exception 'permission denied — managers only' using errcode = '42501';
  end if;

  delete from public.points_ledger where membership_id = p_membership_id;
  get diagnostics v_ledger = row_count;

  delete from public.check_in_events where membership_id = p_membership_id;
  get diagnostics v_checkins = row_count;

  delete from public.redemptions where membership_id = p_membership_id;
  get diagnostics v_redemptions = row_count;

  delete from public.customer_saved_offers where membership_id = p_membership_id;
  get diagnostics v_gifts = row_count;

  delete from public.events where membership_id = p_membership_id;
  get diagnostics v_events = row_count;

  -- Streak engine row back to zero (keep the row; engines expect it).
  update public.member_streaks
     set current_streak = 0, longest_streak = 0, total_checkins = 0,
         last_checkin_at = null, current_period_checkins = 0,
         period_started_at = null, claimed_milestones = '{}'::int[],
         updated_at = now()
   where membership_id = p_membership_id;

  -- Optional tables (exist on fully-migrated DBs; guarded for drift).
  if to_regclass('public.mystery_reward_spins') is not null then
    begin
      execute 'delete from public.mystery_reward_spins where membership_id = $1'
        using p_membership_id;
    exception when undefined_column then null;
    end;
  end if;
  if to_regclass('public.raffle_entries') is not null then
    begin
      execute 'delete from public.raffle_entries where membership_id = $1'
        using p_membership_id;
    exception when undefined_column then null;
    end;
  end if;

  -- This member's notification history for THIS business (bell + queue).
  delete from public.notifications
   where user_id = v_m.user_id and business_id = v_m.business_id;
  get diagnostics v_notifications = row_count;
  delete from public.notification_queue
   where user_id = v_m.user_id and business_id = v_m.business_id;

  -- Membership counters back to day one (account + QR code stay).
  update public.business_memberships
     set points_balance = 0,
         lifetime_points_earned = 0,
         visit_count = 0,
         last_visit_at = null,
         status = 'active',
         updated_at = now()
   where id = p_membership_id;

  return jsonb_build_object(
    'ledger_rows',    v_ledger,
    'check_ins',      v_checkins,
    'redemptions',    v_redemptions,
    'saved_gifts',    v_gifts,
    'spend_events',   v_events,
    'notifications',  v_notifications
  );
end; $$;
grant execute on function public.reset_member_account(uuid) to authenticated;

-- ── 4. directory listing gains is_demo ──────────────────────────────
drop function if exists public.list_business_members(uuid, integer, integer);
create function public.list_business_members(
  p_business_id uuid,
  p_limit       integer default 500,
  p_offset      integer default 0
)
returns table (
  membership_id  uuid,
  user_id        uuid,
  full_name      text,
  email          text,
  phone          text,
  referral_code  text,
  points_balance integer,
  tier           text,
  joined_at      timestamptz,
  visit_count    integer,
  is_vip         boolean,
  is_demo        boolean
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.staffs_business(p_business_id) then
    raise exception 'permission denied';
  end if;
  return query
    select m.id, m.user_id,
           p.full_name::text, p.email::text, p.phone::text,
           m.referral_code::text, m.points_balance, m.tier::text,
           m.joined_at, m.visit_count,
           coalesce(m.membership_payment_status = 'paid', false),
           coalesce(m.is_demo, false)
      from public.business_memberships m
      join public.profiles p on p.id = m.user_id
     where m.business_id = p_business_id
     order by coalesce(m.last_visit_at, m.joined_at) desc
     limit greatest(p_limit, 1) offset greatest(p_offset, 0);
end; $$;
grant execute on function public.list_business_members(uuid, integer, integer) to authenticated;

-- =====================================================================
-- 5. ANALYTICS — exclude demo members everywhere.
-- The predicate used throughout:
--   membership row itself     → and not m.is_demo
--   rows carrying membership  → and not exists (demo membership with that id)
-- =====================================================================

-- ── 5a. manager_daily_recap (CP-30 shape) ───────────────────────────
drop function if exists public.manager_daily_recap(uuid);
create function public.manager_daily_recap(p_business_id uuid)
returns table (
  check_ins_today     integer,
  points_awarded_today integer,
  rewards_redeemed_today integer,
  active_offers       integer,
  new_members_today   integer,
  check_ins_week      integer,
  points_awarded_week integer
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_today_start timestamptz := date_trunc('day', now());
  v_week_start  timestamptz := date_trunc('day', now()) - interval '6 days';
begin
  if not public.staffs_business(p_business_id) then
    raise exception 'permission denied';
  end if;

  return query
  select
    (select count(*)::int
       from public.check_in_events c
       join public.business_memberships m on m.id = c.membership_id
      where m.business_id = p_business_id and c.created_at >= v_today_start
        and not m.is_demo),
    (select coalesce(sum(greatest(l.delta, 0)), 0)::int
       from public.points_ledger l
      where l.business_id = p_business_id and l.created_at >= v_today_start
        and not exists (select 1 from public.business_memberships dm
                         where dm.id = l.membership_id and dm.is_demo)),
    (select count(*)::int
       from public.redemptions r
      where r.business_id = p_business_id
        and r.status in ('pending','fulfilled')
        and r.created_at >= v_today_start
        and not exists (select 1 from public.business_memberships dm
                         where dm.id = r.membership_id and dm.is_demo)),
    (select count(*)::int
       from public.offers
      where business_id = p_business_id
        and is_active
        and (expires_at is null or expires_at > now())),
    (select count(*)::int
       from public.business_memberships
      where business_id = p_business_id and joined_at >= v_today_start
        and not is_demo),
    (select count(*)::int
       from public.check_in_events c
       join public.business_memberships m on m.id = c.membership_id
      where m.business_id = p_business_id and c.created_at >= v_week_start
        and not m.is_demo),
    (select coalesce(sum(greatest(l.delta, 0)), 0)::int
       from public.points_ledger l
      where l.business_id = p_business_id and l.created_at >= v_week_start
        and not exists (select 1 from public.business_memberships dm
                         where dm.id = l.membership_id and dm.is_demo));
end; $$;
grant execute on function public.manager_daily_recap(uuid) to authenticated;

-- ── 5b. business_analytics_rollup (CP-22 shape, manager-gated) ──────
drop function if exists public.business_analytics_rollup(uuid);
create function public.business_analytics_rollup(p_business_id uuid)
returns table (
  total_members        int,
  new_members_30d      int,
  active_members_30d   int,
  repeat_rate_pct      numeric,
  avg_value_cents      numeric,
  redemptions_30d      int,
  points_awarded_30d   bigint,
  redemption_rate_pct  numeric,
  inactive_60d         int,
  total_revenue_30d_cents bigint
)
language sql stable security definer set search_path = public as $$
  with members as (
    select id, user_id, joined_at,
           (select count(*) from public.check_in_events e
             where e.business_id = p_business_id and e.membership_id = m.id) as visit_count,
           (select max(e.created_at) from public.check_in_events e
             where e.business_id = p_business_id and e.membership_id = m.id) as last_visit_at
      from public.business_memberships m
     where m.business_id = p_business_id
       and not m.is_demo
  ),
  ledger_30 as (
    select l.* from public.points_ledger l
     where l.business_id = p_business_id
       and l.created_at >= now() - interval '30 days'
       and not exists (select 1 from public.business_memberships dm
                        where dm.id = l.membership_id and dm.is_demo)
  ),
  events_30 as (
    select e.* from public.events e
     where e.business_id = p_business_id
       and e.event_type = 'purchase'
       and e.amount_cents is not null
       and e.created_at >= now() - interval '30 days'
       and not exists (select 1 from public.business_memberships dm
                        where dm.id = e.membership_id and dm.is_demo)
  )
  select
    (select count(*) from members)::int,
    (select count(*) from members where joined_at >= now() - interval '30 days')::int,
    (select count(*) from members where last_visit_at >= now() - interval '30 days')::int,
    case when (select count(*) from members) > 0
         then ((select count(*) from members where visit_count >= 2)::numeric
               / nullif((select count(*) from members), 0) * 100)::numeric(10,1)
         else 0 end,
    (select coalesce(avg(amount_cents), 0)::numeric(10,0) from events_30),
    (select count(*)::int from public.redemptions r
      where r.business_id = p_business_id
        and r.created_at >= now() - interval '30 days'
        and not exists (select 1 from public.business_memberships dm
                         where dm.id = r.membership_id and dm.is_demo)),
    (select coalesce(sum(delta), 0)::bigint from ledger_30 where delta > 0),
    case when (select sum(delta) from ledger_30 where delta > 0) > 0
         then (
           (select abs(coalesce(sum(delta), 0))::numeric from ledger_30 where delta < 0)
           / nullif((select sum(delta) from ledger_30 where delta > 0)::numeric, 0)
           * 100
         )::numeric(10,1)
         else 0 end,
    (select count(*)::int from members where last_visit_at < now() - interval '60 days'
       or last_visit_at is null),
    (select coalesce(sum(amount_cents), 0)::bigint from events_30)
  where public.is_business_manager(p_business_id);
$$;
grant execute on function public.business_analytics_rollup(uuid) to authenticated;

-- ── 5c. business_analytics (CP-10 shape, jsonb) ─────────────────────
drop function if exists public.business_analytics(uuid, int);
create function public.business_analytics(
  p_business_id uuid, p_days int default 30
)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_period_start timestamptz := now() - (p_days * interval '1 day');
  v_result jsonb;
begin
  if not public.staffs_business(p_business_id) then
    raise exception 'permission denied';
  end if;

  with member_stats as (
    select
      count(*) as total_members,
      count(*) filter (where joined_at > v_period_start) as new_members,
      count(*) filter (where last_visit_at > v_period_start) as active_members,
      count(*) filter (where status = 'dormant') as dormant_members,
      coalesce(avg(lifetime_points_earned)::int, 0) as avg_ltv_points
    from public.business_memberships
    where business_id = p_business_id
      and not is_demo
  ),
  ledger_stats as (
    select
      coalesce(sum(delta) filter (where delta > 0), 0)::int as points_issued,
      coalesce(sum(-delta) filter (where delta < 0), 0)::int as points_redeemed,
      count(*) filter (where rule_type in ('purchase', 'visit')) as transactions,
      count(*) filter (where rule_type = 'review') as reviews,
      count(*) filter (where rule_type = 'referral_referrer') as referrals_completed
    from public.points_ledger l
    where l.business_id = p_business_id
      and l.created_at > v_period_start
      and not exists (select 1 from public.business_memberships dm
                       where dm.id = l.membership_id and dm.is_demo)
  ),
  revenue_stats as (
    select coalesce(sum(amount_cents), 0)::int as revenue_cents,
           count(*)::int as purchase_count
    from public.events e
    where e.business_id = p_business_id
      and e.event_type = 'purchase'
      and e.created_at > v_period_start
      and not exists (select 1 from public.business_memberships dm
                       where dm.id = e.membership_id and dm.is_demo)
  ),
  redemption_stats as (
    select count(*)::int as redemptions
    from public.redemptions r
    where r.business_id = p_business_id
      and r.status = 'fulfilled'
      and r.fulfilled_at > v_period_start
      and not exists (select 1 from public.business_memberships dm
                       where dm.id = r.membership_id and dm.is_demo)
  )
  select jsonb_build_object(
    'total_members',     m.total_members,
    'new_members',       m.new_members,
    'active_members',    m.active_members,
    'dormant_members',   m.dormant_members,
    'avg_ltv_points',    m.avg_ltv_points,
    'points_issued',     l.points_issued,
    'points_redeemed',   l.points_redeemed,
    'transactions',      l.transactions,
    'reviews_earned',    l.reviews,
    'referrals',         l.referrals_completed,
    'revenue_cents',     r.revenue_cents,
    'purchase_count',    r.purchase_count,
    'redemptions',       rd.redemptions
  )
  into v_result
  from member_stats m, ledger_stats l, revenue_stats r, redemption_stats rd;

  return v_result;
end; $$;
grant execute on function public.business_analytics(uuid, int) to authenticated;

-- ── 5d. business_daily_activity (CP-10 shape) ───────────────────────
drop function if exists public.business_daily_activity(uuid, int);
create function public.business_daily_activity(
  p_business_id uuid, p_days int default 30
)
returns table (day date, points_issued int, points_redeemed int, revenue_cents int, transactions int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.staffs_business(p_business_id) then
    raise exception 'permission denied';
  end if;
  return query
  with days as (
    select generate_series(
      (now() - (p_days * interval '1 day'))::date,
      now()::date,
      interval '1 day'
    )::date as day
  ),
  ledger_daily as (
    select
      l.created_at::date as day,
      coalesce(sum(l.delta) filter (where l.delta > 0), 0)::int as pi,
      coalesce(sum(-l.delta) filter (where l.delta < 0), 0)::int as pr,
      count(*) filter (where l.rule_type in ('purchase','visit'))::int as t
    from public.points_ledger l
    where l.business_id = p_business_id
      and l.created_at > (now() - (p_days * interval '1 day'))
      and not exists (select 1 from public.business_memberships dm
                       where dm.id = l.membership_id and dm.is_demo)
    group by 1
  ),
  events_daily as (
    select e.created_at::date as day, coalesce(sum(e.amount_cents), 0)::int as r
    from public.events e
    where e.business_id = p_business_id
      and e.event_type = 'purchase'
      and e.created_at > (now() - (p_days * interval '1 day'))
      and not exists (select 1 from public.business_memberships dm
                       where dm.id = e.membership_id and dm.is_demo)
    group by 1
  )
  select d.day,
         coalesce(l.pi, 0) as points_issued,
         coalesce(l.pr, 0) as points_redeemed,
         coalesce(e.r, 0)  as revenue_cents,
         coalesce(l.t, 0)  as transactions
  from days d
  left join ledger_daily l on l.day = d.day
  left join events_daily e on e.day = d.day
  order by d.day;
end; $$;
grant execute on function public.business_daily_activity(uuid, int) to authenticated;

-- ── 5e. top_members (CP-44 shape, with spend) ───────────────────────
drop function if exists public.top_members(uuid, int);
create function public.top_members(p_business_id uuid, p_limit int default 5)
returns table (
  membership_id uuid, member_name text, member_email text,
  points_balance int, lifetime_points int, tier text, visit_count int,
  total_spent_cents bigint
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.staffs_business(p_business_id) then raise exception 'permission denied'; end if;
  return query
  select m.id, coalesce(p.full_name, split_part(p.email::text, '@', 1)),
         p.email::text, m.points_balance, m.lifetime_points_earned,
         m.tier, m.visit_count,
         (select coalesce(sum(e.amount_cents), 0)::bigint
            from public.events e
           where e.membership_id = m.id and e.amount_cents is not null)
    from public.business_memberships m
    join public.profiles p on p.id = m.user_id
   where m.business_id = p_business_id
     and not m.is_demo
   order by m.lifetime_points_earned desc
   limit p_limit;
end; $$;
grant execute on function public.top_members(uuid, int) to authenticated;

-- ── 5f. top_loyal_members (CP-44 shape, with spend) ─────────────────
drop function if exists public.top_loyal_members(uuid, int);
create function public.top_loyal_members(p_business_id uuid, p_limit int default 10)
returns table (
  membership_id uuid, full_name text, email text,
  lifetime_points int, points_balance int, visit_count int,
  last_visit_at timestamptz, total_spent_cents bigint
)
language sql stable security definer set search_path = public as $$
  select m.id, p.full_name::text, p.email::text,
         m.lifetime_points_earned, m.points_balance, m.visit_count, m.last_visit_at,
         (select coalesce(sum(e.amount_cents), 0)::bigint
            from public.events e
           where e.membership_id = m.id
             and e.amount_cents is not null) as total_spent_cents
    from public.business_memberships m
    left join public.profiles p on p.id = m.user_id
   where m.business_id = p_business_id
     and not m.is_demo
     and public.staffs_business(p_business_id)
   order by m.lifetime_points_earned desc, m.visit_count desc
   limit greatest(1, least(p_limit, 100));
$$;
grant execute on function public.top_loyal_members(uuid, int) to authenticated;

-- ── 5g. atlas_impact_rollup (CP-110 shape, gate kept) ───────────────
drop function if exists public.atlas_impact_rollup(uuid);
create function public.atlas_impact_rollup(p_business_id uuid)
returns table (
  driven_revenue_cents           bigint,
  repeat_visit_lift_pct          numeric,
  reviews_generated              bigint,
  reviews_generated_30d          bigint,
  estimated_review_value_cents   bigint,
  estimated_winback_cents        bigint,
  retention_lift_pct             numeric,
  avg_member_value_cents         bigint,
  member_count                   bigint,
  baseline_visits_30d            int,
  actual_visits_30d              int,
  baseline_revenue_30d_cents     bigint,
  actual_revenue_30d_cents       bigint,
  baseline_google_reviews        int,
  baseline_google_rating         numeric,
  baseline_captured_at           timestamptz,
  baseline_monthly_visits        int,
  baseline_monthly_revenue_cents bigint,
  baseline_avg_ticket_cents      bigint
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_b                 record;
  v_member_count      bigint;
  v_visits_30d        bigint;
  v_reviews_30d       bigint;
  v_reviews_total     bigint;
  v_baseline_visits   int;
  v_baseline_revenue  bigint;
  v_actual_revenue    bigint;
  v_per_visit_cents   bigint := 2500;
  v_review_value_cents bigint := 3500;
begin
  if not public.staffs_business(p_business_id) then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  select * into v_b from public.businesses where id = p_business_id;

  if coalesce(v_b.baseline_avg_ticket_cents, 0) > 0 then
    v_per_visit_cents := v_b.baseline_avg_ticket_cents;
  end if;

  select count(*) into v_member_count
    from public.business_memberships
   where business_id = p_business_id and not is_demo;

  select count(*) into v_visits_30d
    from public.points_ledger l
   where l.business_id = p_business_id
     and l.delta > 0
     and l.created_at > now() - interval '30 days'
     and not exists (select 1 from public.business_memberships dm
                      where dm.id = l.membership_id and dm.is_demo);

  select count(*) into v_reviews_30d
    from public.reviews r
    join public.business_memberships m on m.id = r.membership_id
   where m.business_id = p_business_id
     and r.status = 'verified'
     and r.created_at > now() - interval '30 days'
     and not m.is_demo;

  select count(*) into v_reviews_total
    from public.reviews r
    join public.business_memberships m on m.id = r.membership_id
   where m.business_id = p_business_id
     and r.status = 'verified'
     and not m.is_demo;

  v_baseline_visits := coalesce(v_b.baseline_monthly_visits,
                                greatest(0, (v_visits_30d * 0.1)::int));
  v_actual_revenue  := (v_visits_30d * v_per_visit_cents)::bigint;
  v_baseline_revenue := coalesce(v_b.baseline_monthly_revenue_cents,
                                 (v_baseline_visits * v_per_visit_cents)::bigint);

  return query select
    greatest(0, v_actual_revenue - v_baseline_revenue),
    case when v_baseline_visits > 0
         then round(((v_visits_30d - v_baseline_visits)::numeric / v_baseline_visits) * 100, 0)
         else 0 end,
    v_reviews_total,
    v_reviews_30d,
    (v_reviews_30d * v_review_value_cents)::bigint,
    0::bigint,
    case when v_baseline_visits > 0
         then round(((v_visits_30d - v_baseline_visits)::numeric / v_baseline_visits) * 100, 0)
         else 0 end,
    case when v_member_count > 0 then (v_actual_revenue / v_member_count)::bigint else 0 end,
    v_member_count,
    v_baseline_visits::int,
    v_visits_30d::int,
    v_baseline_revenue,
    v_actual_revenue,
    v_b.baseline_google_review_count,
    v_b.baseline_google_rating,
    v_b.baseline_captured_at,
    v_b.baseline_monthly_visits,
    v_b.baseline_monthly_revenue_cents,
    v_b.baseline_avg_ticket_cents;
end; $$;
grant execute on function public.atlas_impact_rollup(uuid) to authenticated;

-- ── 5h. atlas_impact_monthly (CP-110 shape, gate kept) ──────────────
drop function if exists public.atlas_impact_monthly(uuid);
create function public.atlas_impact_monthly(p_business_id uuid)
returns table (month text, reviews bigint, revenue_cents bigint, visits bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.staffs_business(p_business_id) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  return query
  with months as (
    select date_trunc('month', d)::date as m
      from generate_series(date_trunc('month', now()) - interval '5 months',
                           date_trunc('month', now()),
                           interval '1 month') as d
  ),
  rev as (
    select date_trunc('month', l.created_at)::date as m,
           count(*) filter (where l.delta > 0) as visits,
           (count(*) filter (where l.delta > 0) * 2500)::bigint as revenue
      from public.points_ledger l
      join public.business_memberships bm on bm.id = l.membership_id
     where bm.business_id = p_business_id
       and not bm.is_demo
     group by 1
  ),
  rev_count as (
    select date_trunc('month', coalesce(r.verified_at, r.submitted_at))::date as m,
           count(*) as reviews
      from public.reviews r
     where r.business_id = p_business_id
       and r.status = 'verified'
       and not exists (select 1 from public.business_memberships dm
                        where dm.id = r.membership_id and dm.is_demo)
     group by 1
  )
  select to_char(months.m, 'Mon'),
         coalesce(rev_count.reviews, 0)::bigint,
         coalesce(rev.revenue, 0)::bigint,
         coalesce(rev.visits, 0)::bigint
    from months
    left join rev       on rev.m       = months.m
    left join rev_count on rev_count.m = months.m
   order by months.m;
end; $$;
grant execute on function public.atlas_impact_monthly(uuid) to authenticated;

-- ── 5i. atlas_review_funnel (CP-37.4 shape) ─────────────────────────
drop function if exists public.atlas_review_funnel(uuid);
create function public.atlas_review_funnel(p_business_id uuid)
returns table (
  asks_30d           bigint,
  submitted_30d      bigint,
  verified_30d       bigint,
  star_avg_before    numeric,
  star_avg_after     numeric,
  reviews_lifetime   bigint
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_first_review_at timestamptz;
begin
  select min(verified_at) into v_first_review_at
    from public.reviews
   where business_id = p_business_id and status = 'verified';

  return query
    select
      (select count(*)::bigint
         from public.business_memberships
        where business_id = p_business_id
          and joined_at >= now() - interval '30 days'
          and not is_demo),
      (select count(*)::bigint from public.reviews r
        where r.business_id = p_business_id
          and r.submitted_at >= now() - interval '30 days'
          and not exists (select 1 from public.business_memberships dm
                           where dm.id = r.membership_id and dm.is_demo)),
      (select count(*)::bigint from public.reviews r
        where r.business_id = p_business_id and r.status = 'verified'
          and coalesce(r.verified_at, r.submitted_at) >= now() - interval '30 days'
          and not exists (select 1 from public.business_memberships dm
                           where dm.id = r.membership_id and dm.is_demo)),
      (select avg((verification_data->>'rating')::numeric)
         from public.reviews
        where business_id = p_business_id
          and status = 'verified'
          and v_first_review_at is not null
          and verified_at < v_first_review_at + interval '30 days'),
      (select avg((verification_data->>'rating')::numeric)
         from public.reviews
        where business_id = p_business_id
          and status = 'verified'
          and verified_at >= now() - interval '30 days'),
      (select count(*)::bigint from public.reviews r
        where r.business_id = p_business_id and r.status = 'verified'
          and not exists (select 1 from public.business_memberships dm
                           where dm.id = r.membership_id and dm.is_demo));
end; $$;
grant execute on function public.atlas_review_funnel(uuid) to authenticated;

commit;

notify pgrst, 'reload schema';

-- =====================================================================
-- After applying + deploying the app:
--  · Member panel at the desk (managers): "Demo account" toggle + "Reset
--    account" under the password section.
--  · Mark your own test account demo, hit Reset — Insights, Atlas
--    Impact, revenue charts, recap, and leaderboards all go clean.
-- =====================================================================
