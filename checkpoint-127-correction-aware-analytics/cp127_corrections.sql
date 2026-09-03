-- =====================================================================
-- Atlas · CP-127 — Correction-aware analytics
-- =====================================================================
-- The problem (Exotic, Sep 2026): the desk mistakenly awarded a real
-- member ~$1,000 worth of points. Removing the points fixed the BALANCE,
-- but every analytics surface still counted the mistake:
--   · "points awarded" summed the bad award, and the removal was counted
--     as if the member REDEEMED points;
--   · the member's lifetime_points_earned stayed inflated (skews Top
--     Members and avg member LTV);
--   · the ~$1,000 purchase EVENT (revenue / avg ticket / member spend)
--     was never touched — points and spend are recorded separately.
--
-- The fix — "a manual removal is a CORRECTION, not activity":
--   1. manager_remove_points v2: also deflates lifetime_points_earned,
--      and (new optional arg) writes a negative purchase event so the
--      recorded spend comes down with the points. The desk app now sends
--      the spend correction automatically (points ÷ points-per-$ rate).
--   2. Every analytics RPC nets manual_removal rows OUT of "awarded"
--      instead of counting them as redemptions (retroactive — sums are
--      computed live from the ledger, so Exotic's numbers correct
--      themselves the moment this runs).
--   3. Backfill: lifetime_points_earned deflated for all past manual
--      removals (clamped at 0).
--   4. A commented one-off template to remove the ~$1,000 from Exotic's
--      recorded spend (the deduction already happened, so the app never
--      got the chance to write the correction event).
--
-- All recreated functions keep their CP-120 signatures and shapes
-- (drop-first per the CP-118 lesson). Safe to run on production,
-- re-runnable EXCEPT the backfill in §3 (guarded — see note there).
-- Apply together with the CP-127 app deploy.
-- =====================================================================

begin;

-- ── 1. manager_remove_points v2 ──────────────────────────────────────
-- New optional p_spend_correction_cents: when the desk removes points,
-- the app also sends the dollar equivalent (points ÷ purchase_per_dollar)
-- and this writes a negative purchase event, clamped so a member's
-- recorded spend can never go below zero. p_amount = 0 is now allowed
-- when a spend correction is present (spend-only fix-ups).
drop function if exists public.manager_remove_points(uuid, integer, text);

create function public.manager_remove_points(
  p_membership_id uuid,
  p_amount        integer,                       -- points to remove (>= 0)
  p_notes         text default null,
  p_spend_correction_cents bigint default null   -- CP-127: recorded-spend correction
)
returns table (ledger_id uuid, new_balance integer, removed integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_balance     integer;
  v_remove      integer;
  v_new_balance integer;
  v_ledger_id   uuid;
  v_spent       bigint;
  v_corr        bigint;
begin
  if p_amount is null or p_amount < 0
     or (p_amount = 0 and coalesce(p_spend_correction_cents, 0) <= 0) then
    raise exception 'amount to remove must be a positive integer';
  end if;

  -- Lock the membership row + read current balance.
  select business_id, points_balance
    into v_business_id, v_balance
    from public.business_memberships
   where id = p_membership_id
   for update;

  if v_business_id is null then
    raise exception 'membership % not found', p_membership_id;
  end if;

  -- Authorization against the membership's own business (CP-43 gate).
  if public.current_app_role(v_business_id)
       not in ('agency_admin', 'business_manager', 'business_staff') then
    raise exception 'not authorized for business %', v_business_id
      using errcode = '42501';
  end if;

  -- Clamp: never remove more than the member has.
  v_remove      := least(p_amount, v_balance);
  v_new_balance := v_balance - v_remove;

  -- CP-127: a removal is a correction of an earlier award, so the
  -- member's LIFETIME total comes down too (Top Members / avg LTV were
  -- permanently inflated by mistakes before this).
  update public.business_memberships
     set points_balance         = v_new_balance,
         lifetime_points_earned = greatest(0, lifetime_points_earned - v_remove),
         updated_at             = now()
   where id = p_membership_id;

  if v_remove > 0 then
    insert into public.points_ledger
      (membership_id, business_id, delta, rule_type, balance_after, notes, created_by)
    values
      (p_membership_id, v_business_id, -v_remove, 'manual_removal',
       v_new_balance, coalesce(p_notes, 'Manual point removal'), auth.uid())
    returning id into v_ledger_id;
  end if;

  -- CP-127: recorded-spend correction — a negative purchase event that
  -- nets against revenue, avg ticket and the member's total spend.
  -- Clamped to the member's recorded spend so totals can't go negative.
  if coalesce(p_spend_correction_cents, 0) > 0 then
    select greatest(0, coalesce(sum(e.amount_cents), 0))
      into v_spent
      from public.events e
     where e.membership_id = p_membership_id
       and e.amount_cents is not null;
    v_corr := least(p_spend_correction_cents, v_spent);
    if v_corr > 0 then
      insert into public.events
        (business_id, membership_id, event_type, source, amount_cents, payload)
      values
        (v_business_id, p_membership_id, 'purchase', 'correction', -v_corr,
         jsonb_build_object('source', 'manual_correction',
                            'points_removed', v_remove,
                            'note', coalesce(p_notes, 'Manual point removal')));
    end if;
  end if;

  return query select v_ledger_id, v_new_balance, v_remove;
end; $$;
grant execute on function public.manager_remove_points(uuid, integer, text, bigint) to authenticated;

-- ── 2a. manager_daily_recap — awarded nets manual removals ───────────
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
    -- CP-127: manual removals SUBTRACT from "awarded" (they correct
    -- mistaken awards) instead of being ignored here and miscounted as
    -- redemptions elsewhere. Clamped at 0.
    (select greatest(0, coalesce(sum(case when l.delta > 0 then l.delta
                                          when l.rule_type = 'manual_removal' then l.delta
                                          else 0 end), 0))::int
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
    (select greatest(0, coalesce(sum(case when l.delta > 0 then l.delta
                                          when l.rule_type = 'manual_removal' then l.delta
                                          else 0 end), 0))::int
       from public.points_ledger l
      where l.business_id = p_business_id and l.created_at >= v_week_start
        and not exists (select 1 from public.business_memberships dm
                         where dm.id = l.membership_id and dm.is_demo));
end; $$;
grant execute on function public.manager_daily_recap(uuid) to authenticated;

-- ── 2b. business_analytics_rollup — net awarded, true redemptions,
--        correction-proof avg ticket ────────────────────────────────
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
  ),
  -- CP-127: "awarded" nets out manual removals (corrections of mistaken
  -- awards); "redeemed" counts only real negative activity, NOT removals.
  net_30 as (
    select greatest(0, coalesce(sum(case when delta > 0 then delta
                                         when rule_type = 'manual_removal' then delta
                                         else 0 end), 0))::bigint as awarded,
           abs(coalesce(sum(delta) filter (where delta < 0
                                       and rule_type <> 'manual_removal'), 0))::numeric as redeemed
      from ledger_30
  )
  select
    (select count(*) from members)::int,
    (select count(*) from members where joined_at >= now() - interval '30 days')::int,
    (select count(*) from members where last_visit_at >= now() - interval '30 days')::int,
    case when (select count(*) from members) > 0
         then ((select count(*) from members where visit_count >= 2)::numeric
               / nullif((select count(*) from members), 0) * 100)::numeric(10,1)
         else 0 end,
    -- CP-127: avg ticket ignores negative correction events (a -$1,000
    -- row would poison the average); the revenue SUM below still nets.
    (select coalesce(avg(amount_cents) filter (where amount_cents > 0), 0)::numeric(10,0) from events_30),
    (select count(*)::int from public.redemptions r
      where r.business_id = p_business_id
        and r.created_at >= now() - interval '30 days'
        and not exists (select 1 from public.business_memberships dm
                         where dm.id = r.membership_id and dm.is_demo)),
    (select awarded from net_30),
    case when (select awarded from net_30) > 0
         then ((select redeemed from net_30)
               / nullif((select awarded from net_30)::numeric, 0)
               * 100)::numeric(10,1)
         else 0 end,
    (select count(*)::int from members where last_visit_at < now() - interval '60 days'
       or last_visit_at is null),
    (select greatest(0, coalesce(sum(amount_cents), 0))::bigint from events_30)
  where public.is_business_manager(p_business_id);
$$;
grant execute on function public.business_analytics_rollup(uuid) to authenticated;

-- ── 2c. business_analytics — same netting, jsonb shape ──────────────
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
      -- CP-127: net manual removals out of "issued"; keep them out of
      -- "redeemed" (they are corrections, not redemptions).
      greatest(0, coalesce(sum(case when delta > 0 then delta
                                    when rule_type = 'manual_removal' then delta
                                    else 0 end), 0))::int as points_issued,
      coalesce(sum(-delta) filter (where delta < 0
                               and rule_type <> 'manual_removal'), 0)::int as points_redeemed,
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
    -- CP-127: sum nets negative correction events; count ignores them.
    select greatest(0, coalesce(sum(amount_cents), 0))::int as revenue_cents,
           count(*) filter (where coalesce(amount_cents, 0) >= 0)::int as purchase_count
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

-- ── 2d. business_daily_activity — per-day netting ───────────────────
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
      -- CP-127: net manual removals out of "issued" per day; keep them
      -- out of "redeemed".
      greatest(0, coalesce(sum(l.delta) filter (where l.delta > 0), 0)
                + coalesce(sum(l.delta) filter (where l.rule_type = 'manual_removal'
                                            and l.delta < 0), 0))::int as pi,
      coalesce(sum(-l.delta) filter (where l.delta < 0
                                 and l.rule_type <> 'manual_removal'), 0)::int as pr,
      count(*) filter (where l.rule_type in ('purchase','visit'))::int as t
    from public.points_ledger l
    where l.business_id = p_business_id
      and l.created_at > (now() - (p_days * interval '1 day'))
      and not exists (select 1 from public.business_memberships dm
                       where dm.id = l.membership_id and dm.is_demo)
    group by 1
  ),
  events_daily as (
    -- CP-127: nets negative correction events (clamped at 0 per day).
    select e.created_at::date as day,
           greatest(0, coalesce(sum(e.amount_cents), 0))::int as r
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

-- ── 2e. atlas_impact_rollup — mistaken awards don't count as visits ──
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

  -- CP-127: each manual removal cancels one mistaken award, so it also
  -- cancels the "visit" that award implied (clamped at 0).
  select greatest(0, count(*) filter (where l.delta > 0)
                   - count(*) filter (where l.rule_type = 'manual_removal'
                                  and l.delta < 0))
    into v_visits_30d
    from public.points_ledger l
   where l.business_id = p_business_id
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

-- ── 2f. atlas_impact_monthly — same visit netting per month ─────────
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
           -- CP-127: manual removals cancel the mistaken award's visit.
           greatest(0, count(*) filter (where l.delta > 0)
                     - count(*) filter (where l.rule_type = 'manual_removal'
                                    and l.delta < 0)) as visits
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
         (coalesce(rev.visits, 0) * 2500)::bigint,
         coalesce(rev.visits, 0)::bigint
    from months
    left join rev       on rev.m       = months.m
    left join rev_count on rev_count.m = months.m
   order by months.m;
end; $$;
grant execute on function public.atlas_impact_monthly(uuid) to authenticated;

-- ── 3. BACKFILL: deflate lifetime totals for past manual removals ───
-- Every manual removal ever made now also reduces that member's
-- lifetime_points_earned (clamped at 0) — Exotic's incident included.
-- Idempotent: each ledger row is stamped '[cp127-backfilled]' as it is
-- counted, and only unstamped rows are ever counted, so re-running this
-- file stamps nothing and deflates nothing. New removals after this
-- migration are handled live by manager_remove_points v2, never here.
with stamped as (
  update public.points_ledger
     set notes = coalesce(notes, 'Manual point removal') || ' [cp127-backfilled]'
   where rule_type = 'manual_removal' and delta < 0
     and coalesce(notes, '') not like '%[cp127-backfilled]%'
  returning membership_id, delta
),
counted as (
  select membership_id, sum(-delta)::int as removed
    from stamped
   group by membership_id
)
update public.business_memberships m
   set lifetime_points_earned = greatest(0, m.lifetime_points_earned - c.removed),
       updated_at = now()
  from counted c
 where c.membership_id = m.id;

commit;

notify pgrst, 'reload schema';

-- =====================================================================
-- 4. ONE-OFF for the Exotic incident (run separately, AFTER filling in
--    the two placeholders): the points were already deducted before this
--    checkpoint existed, so the app never wrote the spend correction.
--    This removes the mistaken dollars from that member's recorded
--    spend. Fill in the member's EMAIL and the amount in CENTS
--    (e.g. $1,000 → 100000), then run it once.
-- =====================================================================
-- insert into public.events
--   (business_id, membership_id, event_type, source, amount_cents, payload)
-- select m.business_id, m.id, 'purchase', 'correction', -100000,
--        jsonb_build_object('source', 'manual_correction',
--                           'note', 'CP-127 one-off: mistaken desk award')
--   from public.business_memberships m
--   join public.profiles p on p.id = m.user_id
--  where m.business_id = (select id from public.businesses where slug = 'exotic')
--    and lower(p.email::text) = lower('MEMBER_EMAIL_HERE');
