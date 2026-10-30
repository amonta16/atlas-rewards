-- =====================================================================
-- CHECKPOINT 10 — Analytics RPCs + fix for the CP 2 logo policy
-- =====================================================================

-- -- LOGO UPLOAD FIX --
-- The CP 2 storage policy used `create policy if not exists` which silently
-- failed on some Supabase Postgres versions, so the logo bucket never got
-- a policy. Drop + recreate cleanly here.
do $$
begin
  begin drop policy "Agency admins manage logos" on storage.objects; exception when undefined_object then null; end;
  begin drop policy "Public read on logos"       on storage.objects; exception when undefined_object then null; end;
end $$;

create policy "Agency admins manage logos" on storage.objects for all to authenticated
  using (bucket_id = 'business-logos' and exists (
    select 1 from public.business_users where user_id = auth.uid() and role = 'agency_admin'
  ));
create policy "Public read on logos" on storage.objects for select to public
  using (bucket_id = 'business-logos');

-- =====================================================================
-- business_analytics: rollup stats for one business over N days
-- =====================================================================
create or replace function public.business_analytics(
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
  ),
  ledger_stats as (
    select
      coalesce(sum(delta) filter (where delta > 0), 0)::int as points_issued,
      coalesce(sum(-delta) filter (where delta < 0), 0)::int as points_redeemed,
      count(*) filter (where rule_type in ('purchase', 'visit')) as transactions,
      count(*) filter (where rule_type = 'review') as reviews,
      count(*) filter (where rule_type = 'referral_referrer') as referrals_completed
    from public.points_ledger
    where business_id = p_business_id
      and created_at > v_period_start
  ),
  revenue_stats as (
    select coalesce(sum(amount_cents), 0)::int as revenue_cents,
           count(*)::int as purchase_count
    from public.events
    where business_id = p_business_id
      and event_type = 'purchase'
      and created_at > v_period_start
  ),
  redemption_stats as (
    select count(*)::int as redemptions
    from public.redemptions
    where business_id = p_business_id
      and status = 'fulfilled'
      and fulfilled_at > v_period_start
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

-- =====================================================================
-- business_daily_activity: per-day breakdown for charts
-- =====================================================================
create or replace function public.business_daily_activity(
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
      created_at::date as day,
      coalesce(sum(delta) filter (where delta > 0), 0)::int as pi,
      coalesce(sum(-delta) filter (where delta < 0), 0)::int as pr,
      count(*) filter (where rule_type in ('purchase','visit'))::int as t
    from public.points_ledger
    where business_id = p_business_id
      and created_at > (now() - (p_days * interval '1 day'))
    group by 1
  ),
  events_daily as (
    select created_at::date as day, coalesce(sum(amount_cents), 0)::int as r
    from public.events
    where business_id = p_business_id
      and event_type = 'purchase'
      and created_at > (now() - (p_days * interval '1 day'))
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

-- =====================================================================
-- top_members: list highest-spending members for a business
-- =====================================================================
create or replace function public.top_members(p_business_id uuid, p_limit int default 5)
returns table (
  membership_id uuid, member_name text, member_email text,
  points_balance int, lifetime_points int, tier text, visit_count int
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.staffs_business(p_business_id) then raise exception 'permission denied'; end if;
  return query
  select m.id, coalesce(p.full_name, split_part(p.email::text, '@', 1)),
         p.email::text, m.points_balance, m.lifetime_points_earned,
         m.tier, m.visit_count
    from public.business_memberships m
    join public.profiles p on p.id = m.user_id
   where m.business_id = p_business_id
   order by m.lifetime_points_earned desc
   limit p_limit;
end; $$;
grant execute on function public.top_members(uuid, int) to authenticated;

-- =====================================================================
-- agency_rollup: across-all-businesses metrics (for the agency dashboard)
-- =====================================================================
create or replace function public.agency_rollup()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_result jsonb;
begin
  if not public.is_agency_admin() then raise exception 'permission denied'; end if;
  with biz as (
    select
      count(*) as total_businesses,
      count(*) filter (where status = 'active') as active_businesses
    from public.businesses
  ),
  members as (
    select
      count(*) as total_members,
      count(*) filter (where last_visit_at > now() - interval '30 days') as active_30d
    from public.business_memberships
  ),
  revenue as (
    select coalesce(sum(amount_cents), 0)::int as revenue_30d
    from public.events
    where event_type = 'purchase' and created_at > now() - interval '30 days'
  )
  select jsonb_build_object(
    'total_businesses',  b.total_businesses,
    'active_businesses', b.active_businesses,
    'total_members',     m.total_members,
    'active_30d',        m.active_30d,
    'revenue_30d_cents', r.revenue_30d
  ) into v_result
  from biz b, members m, revenue r;
  return v_result;
end; $$;
grant execute on function public.agency_rollup() to authenticated;
