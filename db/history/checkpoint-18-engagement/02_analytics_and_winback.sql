-- =====================================================================
-- CHECKPOINT 18 (part 2) — Merchant Analytics + Re-engagement + Come-Back AI
-- =====================================================================
-- Every RPC here is read-only except trigger_winback_offers(), which the
-- daily cron calls to push proactive "we miss you" offers to members who
-- are statistically overdue for a visit.
-- =====================================================================

-- ----- 1. Per-member visit cadence + overdue scoring -----
-- A "visit" = a row in points_ledger with rule_type = 'visit' OR a booking
-- that reached 'completed'. We treat the first observation in either source
-- as a visit timestamp.
create or replace view public.member_visit_events as
  select pl.business_id, pl.membership_id, pl.created_at as visit_at
    from public.points_ledger pl
   where pl.rule_type = 'visit' and pl.membership_id is not null
  union all
  select b.business_id, b.membership_id, b.completed_at as visit_at
    from public.bookings b
   where b.status = 'completed' and b.membership_id is not null and b.completed_at is not null;

-- ----- 2. RPC: come-back predictions for a business -----
-- For each member with at least 2 visits, compute:
--   • visits          : total
--   • avg_gap_days    : mean gap between consecutive visits
--   • days_since_last : days since their most recent visit
--   • overdue_factor  : days_since_last / avg_gap_days (>1.5 = clearly slipping)
create or replace function public.come_back_predictions(p_business_id uuid)
returns table (
  membership_id uuid,
  full_name text,
  email text,
  visits int,
  avg_gap_days numeric,
  last_visit_at timestamptz,
  days_since_last numeric,
  overdue_factor numeric
)
language sql stable security definer set search_path = public as $$
  with v as (
    select membership_id, visit_at,
           lag(visit_at) over (partition by membership_id order by visit_at) as prev_visit_at
      from public.member_visit_events
     where business_id = p_business_id
  ),
  gaps as (
    select membership_id,
           extract(epoch from (visit_at - prev_visit_at)) / 86400.0 as gap_days,
           visit_at
      from v
     where prev_visit_at is not null
  ),
  agg as (
    select membership_id,
           count(*) + 1                          as visits,
           avg(gap_days)::numeric(10,2)          as avg_gap_days,
           max(visit_at)                         as last_visit_at
      from gaps
     group by membership_id
  )
  select a.membership_id,
         p.full_name,
         p.email,
         a.visits,
         a.avg_gap_days,
         a.last_visit_at,
         (extract(epoch from (now() - a.last_visit_at)) / 86400.0)::numeric(10,2) as days_since_last,
         case when a.avg_gap_days > 0
              then ((extract(epoch from (now() - a.last_visit_at)) / 86400.0) / a.avg_gap_days)::numeric(10,2)
              else null end                       as overdue_factor
    from agg a
    join public.business_memberships m on m.id = a.membership_id
    left join public.profiles p on p.id = m.user_id
   where public.staffs_business(p_business_id);
$$;
grant execute on function public.come_back_predictions(uuid) to authenticated;

-- ----- 3. RPC: business analytics rollup -----
-- One-shot rollup the Insights tab calls on mount. All metrics scoped to
-- the last 30 days unless otherwise noted.
create or replace function public.business_analytics_rollup(p_business_id uuid)
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
           (select count(*) from public.member_visit_events e
             where e.business_id = p_business_id and e.membership_id = m.id) as visit_count,
           (select max(visit_at) from public.member_visit_events e
             where e.business_id = p_business_id and e.membership_id = m.id) as last_visit_at
      from public.business_memberships m
     where m.business_id = p_business_id
  ),
  ledger_30 as (
    select * from public.points_ledger
     where business_id = p_business_id
       and created_at >= now() - interval '30 days'
  )
  select
    (select count(*) from members)::int                                  as total_members,
    (select count(*) from members where joined_at >= now() - interval '30 days')::int as new_members_30d,
    (select count(*) from members where last_visit_at >= now() - interval '30 days')::int as active_members_30d,
    case when (select count(*) from members) > 0
         then ((select count(*) from members where visit_count >= 2)::numeric
               / nullif((select count(*) from members), 0) * 100)::numeric(10,1)
         else 0 end                                                       as repeat_rate_pct,
    -- Avg value: average of redemption point_cost translates to "what each member earned per visit" proxy.
    (select coalesce(avg(amount_cents), 0)::numeric(10,0)
       from public.points_ledger
      where business_id = p_business_id
        and amount_cents is not null
        and created_at >= now() - interval '30 days')                     as avg_value_cents,
    (select count(*)::int from public.redemptions
      where business_id = p_business_id
        and created_at >= now() - interval '30 days')                     as redemptions_30d,
    (select coalesce(sum(delta), 0)::bigint from ledger_30 where delta > 0) as points_awarded_30d,
    case when (select sum(delta) from ledger_30 where delta > 0) > 0
         then (
           (select abs(coalesce(sum(delta), 0))::numeric from ledger_30 where delta < 0)
           / nullif((select sum(delta) from ledger_30 where delta > 0)::numeric, 0)
           * 100
         )::numeric(10,1)
         else 0 end                                                       as redemption_rate_pct,
    (select count(*)::int from members where last_visit_at < now() - interval '60 days'
       or last_visit_at is null)                                          as inactive_60d,
    (select coalesce(sum(amount_cents), 0)::bigint
       from public.points_ledger
      where business_id = p_business_id
        and amount_cents is not null
        and rule_type in ('purchase_per_dollar','visit')
        and created_at >= now() - interval '30 days')                     as total_revenue_30d_cents
  where public.staffs_business(p_business_id);
$$;
grant execute on function public.business_analytics_rollup(uuid) to authenticated;

-- ----- 4. RPC: top loyal members -----
create or replace function public.top_loyal_members(p_business_id uuid, p_limit int default 10)
returns table (
  membership_id uuid, full_name text, email text,
  lifetime_points int, points_balance int, visit_count int, last_visit_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select m.id, p.full_name, p.email,
         m.lifetime_points_earned, m.points_balance, m.visit_count, m.last_visit_at
    from public.business_memberships m
    left join public.profiles p on p.id = m.user_id
   where m.business_id = p_business_id
     and public.staffs_business(p_business_id)
   order by m.lifetime_points_earned desc, m.visit_count desc
   limit greatest(1, least(p_limit, 100));
$$;
grant execute on function public.top_loyal_members(uuid, int) to authenticated;

-- ----- 5. RPC: busiest hours over last 30 days -----
create or replace function public.busiest_hours(p_business_id uuid)
returns table (hour_of_day int, visit_count bigint)
language sql stable security definer set search_path = public as $$
  select extract(hour from visit_at at time zone 'UTC')::int as hour_of_day,
         count(*)::bigint                                    as visit_count
    from public.member_visit_events
   where business_id = p_business_id
     and visit_at >= now() - interval '30 days'
     and public.staffs_business(p_business_id)
   group by 1
   order by 1;
$$;
grant execute on function public.busiest_hours(uuid) to authenticated;

-- ----- 6. RPC: inactive members (paged) -----
create or replace function public.inactive_members(
  p_business_id uuid,
  p_min_days    int default 30,
  p_limit       int default 50
)
returns table (
  membership_id uuid, full_name text, email text, phone text,
  last_visit_at timestamptz, days_since_last numeric, visit_count int
)
language sql stable security definer set search_path = public as $$
  select m.id, p.full_name, p.email, p.phone,
         m.last_visit_at,
         case when m.last_visit_at is null then null
              else (extract(epoch from (now() - m.last_visit_at)) / 86400.0)::numeric(10,1)
              end as days_since_last,
         m.visit_count
    from public.business_memberships m
    left join public.profiles p on p.id = m.user_id
   where m.business_id = p_business_id
     and public.staffs_business(p_business_id)
     and (m.last_visit_at is null or m.last_visit_at < now() - (p_min_days || ' days')::interval)
   order by m.last_visit_at asc nulls last
   limit greatest(1, least(p_limit, 200));
$$;
grant execute on function public.inactive_members(uuid, int, int) to authenticated;

-- ----- 7. Win-back: send a personal "come back" offer to one overdue member -----
-- Inserts a row into customer_messages (created below if missing) which the
-- app side surfaces as a personal banner. Optionally drops bonus points.
create table if not exists public.customer_messages (
  id              uuid primary key default uuid_generate_v4(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  membership_id   uuid not null references public.business_memberships(id) on delete cascade,
  kind            text not null check (kind in ('winback','reminder','offer','milestone')),
  title           text not null,
  body            text,
  bonus_points    int,
  expires_at      timestamptz,
  is_dismissed    boolean not null default false,
  created_at      timestamptz not null default now()
);
create index if not exists customer_messages_member_idx on public.customer_messages(membership_id, created_at desc);

alter table public.customer_messages enable row level security;
do $$ begin
  begin drop policy "cust_msg_self" on public.customer_messages; exception when undefined_object then null; end;
  begin drop policy "cust_msg_staff" on public.customer_messages; exception when undefined_object then null; end;
end $$;
create policy "cust_msg_self" on public.customer_messages for all to authenticated
  using (exists (select 1 from public.business_memberships m where m.id = membership_id and m.user_id = auth.uid()))
  with check (exists (select 1 from public.business_memberships m where m.id = membership_id and m.user_id = auth.uid()));
create policy "cust_msg_staff" on public.customer_messages for all to authenticated
  using (public.staffs_business(business_id))
  with check (public.staffs_business(business_id));

-- ----- 8. RPC: send one win-back message -----
create or replace function public.send_winback(
  p_business_id   uuid,
  p_membership_id uuid,
  p_title         text default null,
  p_body          text default null,
  p_bonus_points  int  default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.staffs_business(p_business_id) then raise exception 'permission denied'; end if;

  insert into public.customer_messages
    (business_id, membership_id, kind, title, body, bonus_points, expires_at)
  values
    (p_business_id, p_membership_id, 'winback',
     coalesce(p_title, 'We miss you ☕'),
     coalesce(p_body, 'Tap to claim your come-back bonus.'),
     p_bonus_points,
     now() + interval '14 days')
  returning id into v_id;

  -- Drop the bonus points immediately if specified.
  if coalesce(p_bonus_points, 0) > 0 then
    insert into public.points_ledger
      (business_id, membership_id, delta, rule_type, notes)
    values
      (p_business_id, p_membership_id, p_bonus_points, 'winback_bonus',
       'Win-back bonus from come-back AI');
    update public.business_memberships
       set points_balance = points_balance + p_bonus_points,
           lifetime_points_earned = lifetime_points_earned + p_bonus_points
     where id = p_membership_id;
  end if;
  return v_id;
end; $$;
grant execute on function public.send_winback(uuid, uuid, text, text, int) to authenticated;

-- ----- 9. Cron RPC: trigger win-back for *all* overdue members -----
-- Threshold: overdue_factor >= 1.5 AND days_since_last >= 7. Skip anyone
-- who already received a winback in the last 30 days.
create or replace function public.trigger_winback_offers(p_default_bonus_points int default 50)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_biz   record;
  v_pred  record;
  v_count int := 0;
begin
  for v_biz in select id from public.businesses where status = 'active' loop
    for v_pred in
      select cp.membership_id, cp.overdue_factor, cp.days_since_last
        from public.come_back_predictions(v_biz.id) cp
       where cp.overdue_factor >= 1.5
         and cp.days_since_last >= 7
         and not exists (
           select 1 from public.customer_messages c
            where c.membership_id = cp.membership_id
              and c.kind = 'winback'
              and c.created_at >= now() - interval '30 days'
         )
    loop
      perform public.send_winback(
        v_biz.id, v_pred.membership_id,
        'We miss you ✨',
        'Here''s a little bonus to welcome you back.',
        p_default_bonus_points
      );
      v_count := v_count + 1;
    end loop;
  end loop;
  return v_count;
end; $$;
grant execute on function public.trigger_winback_offers(int) to service_role;
