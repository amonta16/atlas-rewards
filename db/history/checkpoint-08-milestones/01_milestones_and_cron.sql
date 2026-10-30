-- =====================================================================
-- CHECKPOINT 8 — Birthday, milestone, and reactivation rewards
-- =====================================================================
-- - Birthday auto-bonus (daily cron)
-- - Visit milestones (event-driven inside award_points)
-- - Dormancy detection (daily cron, marks members dormant)
-- =====================================================================

-- Enable pg_cron — Supabase dashboard alternative: Database → Extensions → pg_cron
create extension if not exists pg_cron;

-- =====================================================================
-- Schema additions: milestone_rules + reactivation point rule default
-- =====================================================================
alter table public.businesses
  add column if not exists milestone_rules jsonb
    not null default '{"5": 100, "10": 250, "25": 500, "50": 1000, "100": 2500}'::jsonb;

-- Add reactivation key to existing businesses (if missing)
update public.businesses
   set point_rules = coalesce(point_rules, '{}'::jsonb) ||
                     jsonb_build_object('reactivation', 150)
 where not (point_rules ? 'reactivation');

-- =====================================================================
-- Update award_points to bump visit_count + last_visit_at on visit/purchase
-- AND check milestone thresholds.
-- =====================================================================
create or replace function public.award_points(
  p_membership_id  uuid,
  p_delta          integer,
  p_rule_type      text,
  p_reference_id   uuid default null,
  p_idempotency_key text default null,
  p_notes          text default null
)
returns table (ledger_id uuid, new_balance integer)
language plpgsql security definer set search_path = public as $$
declare
  v_business_id   uuid;
  v_new_balance   integer;
  v_ledger_id     uuid;
  v_existing_id   uuid;
  v_new_visits    integer;
  v_milestones    jsonb;
  v_milestone_pts integer;
  v_bumps_visit   boolean := p_rule_type in ('visit', 'purchase');
begin
  -- Idempotency short-circuit
  if p_idempotency_key is not null then
    select id into v_existing_id from public.points_ledger where idempotency_key = p_idempotency_key;
    if v_existing_id is not null then
      return query
        select l.id, m.points_balance
          from public.points_ledger l
          join public.business_memberships m on m.id = l.membership_id
         where l.id = v_existing_id;
      return;
    end if;
  end if;

  -- Lock the membership row
  select business_id, points_balance + p_delta
    into v_business_id, v_new_balance
    from public.business_memberships
   where id = p_membership_id
   for update;

  if v_business_id is null then raise exception 'membership % not found', p_membership_id; end if;
  if v_new_balance < 0 then raise exception 'insufficient points (would go to %)', v_new_balance; end if;

  -- Update balance + visit fields (if applicable)
  if v_bumps_visit then
    update public.business_memberships
       set points_balance = v_new_balance,
           lifetime_points_earned = lifetime_points_earned + greatest(p_delta, 0),
           visit_count = visit_count + 1,
           last_visit_at = now(),
           status = case when status = 'dormant' then 'active' else status end,
           updated_at = now()
     where id = p_membership_id
     returning visit_count into v_new_visits;
  else
    update public.business_memberships
       set points_balance = v_new_balance,
           lifetime_points_earned = lifetime_points_earned + greatest(p_delta, 0),
           updated_at = now()
     where id = p_membership_id;
  end if;

  -- Write ledger
  insert into public.points_ledger
    (membership_id, business_id, delta, rule_type, reference_id, idempotency_key, balance_after, notes, created_by)
  values
    (p_membership_id, v_business_id, p_delta, p_rule_type, p_reference_id, p_idempotency_key, v_new_balance, p_notes, auth.uid())
  returning id into v_ledger_id;

  -- Recalc tier
  perform public.recalc_tier(p_membership_id);

  -- Milestone check (only for visit/purchase awards)
  if v_bumps_visit then
    select milestone_rules into v_milestones from public.businesses where id = v_business_id;
    select (v_milestones->>(v_new_visits::text))::int into v_milestone_pts;
    if v_milestone_pts is not null and v_milestone_pts > 0 then
      -- Award the milestone via recursive call with a unique idempotency key
      perform public.award_points(
        p_membership_id, v_milestone_pts, 'milestone',
        null,
        'milestone_' || p_membership_id || '_visit_' || v_new_visits,
        'Visit #' || v_new_visits || ' milestone bonus'
      );
    end if;
  end if;

  return query select v_ledger_id, v_new_balance;
end; $$;

-- =====================================================================
-- BIRTHDAY auto-award (cron daily)
-- =====================================================================
create or replace function public.process_birthdays()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_count int := 0;
  r record;
  v_bonus int;
begin
  for r in
    select m.id as membership_id, m.business_id
      from public.business_memberships m
      join public.profiles p on p.id = m.user_id
     where p.birthday is not null
       and to_char(p.birthday, 'MM-DD') = to_char(now() at time zone 'utc', 'MM-DD')
       and m.status <> 'blocked'
       -- Hasn't already been awarded birthday this year
       and not exists (
         select 1 from public.points_ledger l
          where l.membership_id = m.id
            and l.rule_type = 'birthday'
            and l.created_at >= date_trunc('year', now())
       )
  loop
    select coalesce((point_rules->>'birthday')::int, 0)
      into v_bonus from public.businesses where id = r.business_id;
    if v_bonus > 0 then
      perform public.award_points(
        r.membership_id, v_bonus, 'birthday',
        null,
        'birthday_' || r.membership_id || '_' || to_char(now(), 'YYYY'),
        'Birthday bonus 🎂'
      );
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end; $$;

-- =====================================================================
-- DORMANCY detection (cron daily) — marks members dormant after 60 days
-- =====================================================================
create or replace function public.process_dormancy()
returns int language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  update public.business_memberships
     set status = 'dormant', updated_at = now()
   where status = 'active'
     and last_visit_at is not null
     and last_visit_at < (now() - interval '60 days');
  get diagnostics v_count = row_count;
  return v_count;
end; $$;

-- =====================================================================
-- Schedule the crons (idempotent — uses cron.unschedule on conflict)
-- Runs daily at 09:00 UTC.
-- =====================================================================
do $$
begin
  -- Drop existing schedules if they exist
  perform cron.unschedule('atlas-birthday')   where exists (select 1 from cron.job where jobname='atlas-birthday');
  perform cron.unschedule('atlas-dormancy')   where exists (select 1 from cron.job where jobname='atlas-dormancy');
exception when others then null;
end $$;

select cron.schedule('atlas-birthday', '0 9 * * *',  $$ select public.process_birthdays();  $$);
select cron.schedule('atlas-dormancy', '15 9 * * *', $$ select public.process_dormancy();   $$);
