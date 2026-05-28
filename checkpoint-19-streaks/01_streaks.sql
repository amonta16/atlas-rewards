-- =====================================================================
-- CHECKPOINT 19 — Streak / Check-in attendance system
-- =====================================================================
-- Per-business configurable streak engine. Agency picks a period (daily,
-- weekly, monthly), how many check-ins are needed per period to keep the
-- streak alive, and a list of milestones (Day 5, Day 10, Day 30, ...) that
-- award points + optionally a mystery-reward spin.
--
-- Manager front-desk hits a "Check In" button → member_checkin RPC updates
-- the member's streak, fires any milestone awards, and writes an audit row.
-- =====================================================================

-- ----- 1. Per-business config -----
create table if not exists public.streak_config (
  business_id        uuid primary key references public.businesses(id) on delete cascade,
  is_enabled         boolean not null default false,
  period_type        text not null default 'daily'
                     check (period_type in ('daily','weekly','monthly')),
  checkins_required_per_period int not null default 1,
  reset_grace_hours  int not null default 6,
  -- Milestones: [{count:5, label:"5 in a row", points:50, mystery:false}, ...]
  milestones         jsonb not null default
    '[{"count":3,"label":"3 in a row","points":50,"mystery":false},
      {"count":7,"label":"1 week","points":150,"mystery":false},
      {"count":14,"label":"2 weeks","points":350,"mystery":true},
      {"count":30,"label":"1 month","points":800,"mystery":true}]'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

drop trigger if exists trg_streak_config_updated on public.streak_config;
create trigger trg_streak_config_updated before update on public.streak_config
  for each row execute function public.set_updated_at();

alter table public.streak_config enable row level security;
do $$ begin
  begin drop policy "streak_cfg_public_read" on public.streak_config; exception when undefined_object then null; end;
  begin drop policy "streak_cfg_staff_write" on public.streak_config; exception when undefined_object then null; end;
end $$;
create policy "streak_cfg_public_read" on public.streak_config for select to public using (true);
create policy "streak_cfg_staff_write" on public.streak_config for all to authenticated
  using (public.staffs_business(business_id))
  with check (public.staffs_business(business_id));

-- ----- 2. Per-member streak state -----
create table if not exists public.member_streaks (
  id                       uuid primary key default uuid_generate_v4(),
  business_id              uuid not null references public.businesses(id) on delete cascade,
  membership_id            uuid not null references public.business_memberships(id) on delete cascade,
  current_streak           int not null default 0,
  longest_streak           int not null default 0,
  total_checkins           int not null default 0,
  last_checkin_at          timestamptz,
  current_period_checkins  int not null default 0,
  period_started_at        timestamptz,
  -- Which milestone "count" thresholds have already been awarded — so we
  -- never double-pay for the same milestone within a streak run.
  claimed_milestones       int[] not null default '{}'::int[],
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (business_id, membership_id)
);
create index if not exists member_streaks_biz_idx on public.member_streaks(business_id, current_streak desc);

drop trigger if exists trg_member_streaks_updated on public.member_streaks;
create trigger trg_member_streaks_updated before update on public.member_streaks
  for each row execute function public.set_updated_at();

alter table public.member_streaks enable row level security;
do $$ begin
  begin drop policy "streaks_self_read"  on public.member_streaks; exception when undefined_object then null; end;
  begin drop policy "streaks_staff"      on public.member_streaks; exception when undefined_object then null; end;
end $$;
create policy "streaks_self_read" on public.member_streaks for select to authenticated
  using (exists (select 1 from public.business_memberships m where m.id = membership_id and m.user_id = auth.uid()));
create policy "streaks_staff" on public.member_streaks for all to authenticated
  using (public.staffs_business(business_id))
  with check (public.staffs_business(business_id));

-- ----- 3. Check-in event ledger -----
create table if not exists public.check_in_events (
  id                        uuid primary key default uuid_generate_v4(),
  business_id               uuid not null references public.businesses(id) on delete cascade,
  membership_id             uuid not null references public.business_memberships(id) on delete cascade,
  streak_after              int not null,
  awarded_points            int not null default 0,
  is_milestone              boolean not null default false,
  milestone_label           text,
  milestone_mystery_unlocked boolean not null default false,
  checked_in_by_user_id     uuid references auth.users(id),
  created_at                timestamptz not null default now()
);
create index if not exists checkin_events_member_idx on public.check_in_events(membership_id, created_at desc);
create index if not exists checkin_events_biz_idx    on public.check_in_events(business_id, created_at desc);

alter table public.check_in_events enable row level security;
do $$ begin
  begin drop policy "checkin_self_read" on public.check_in_events; exception when undefined_object then null; end;
  begin drop policy "checkin_staff"     on public.check_in_events; exception when undefined_object then null; end;
end $$;
create policy "checkin_self_read" on public.check_in_events for select to authenticated
  using (exists (select 1 from public.business_memberships m where m.id = membership_id and m.user_id = auth.uid()));
create policy "checkin_staff" on public.check_in_events for all to authenticated
  using (public.staffs_business(business_id))
  with check (public.staffs_business(business_id));

-- ----- 4. Helper: period bucket for a timestamp -----
create or replace function public.streak_period_start(p_when timestamptz, p_period text)
returns timestamptz language sql immutable as $$
  select case p_period
    when 'daily'   then date_trunc('day',   p_when)
    when 'weekly'  then date_trunc('week',  p_when)
    when 'monthly' then date_trunc('month', p_when)
    else date_trunc('day', p_when)
  end;
$$;

-- ----- 5. Upsert agency config -----
create or replace function public.upsert_streak_config(
  p_business_id                  uuid,
  p_is_enabled                   boolean,
  p_period_type                  text,
  p_checkins_required_per_period int,
  p_reset_grace_hours            int,
  p_milestones                   jsonb
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.staffs_business(p_business_id) then raise exception 'permission denied'; end if;
  if p_period_type not in ('daily','weekly','monthly') then raise exception 'invalid period_type'; end if;

  insert into public.streak_config
    (business_id, is_enabled, period_type, checkins_required_per_period, reset_grace_hours, milestones)
  values
    (p_business_id, p_is_enabled, p_period_type, greatest(1, p_checkins_required_per_period),
     greatest(0, p_reset_grace_hours), coalesce(p_milestones, '[]'::jsonb))
  on conflict (business_id) do update set
    is_enabled                    = excluded.is_enabled,
    period_type                   = excluded.period_type,
    checkins_required_per_period  = excluded.checkins_required_per_period,
    reset_grace_hours             = excluded.reset_grace_hours,
    milestones                    = excluded.milestones,
    updated_at                    = now();
end; $$;
grant execute on function public.upsert_streak_config(uuid, boolean, text, int, int, jsonb) to authenticated;

-- ----- 6. The main RPC: member_checkin -----
-- Manager calls this when scanning/marking attendance. Idempotent within a
-- period — calling twice on the same day (for daily) is a no-op return.
create or replace function public.member_checkin(
  p_business_id   uuid,
  p_membership_id uuid
)
returns table (
  streak_after        int,
  longest_after       int,
  awarded_points      int,
  is_milestone        boolean,
  milestone_label     text,
  milestone_mystery_unlocked boolean,
  already_checked_in  boolean
)
language plpgsql security definer set search_path = public as $$
declare
  v_cfg             record;
  v_state           record;
  v_now             timestamptz := now();
  v_period_start    timestamptz;
  v_prev_period_start timestamptz;
  v_new_streak      int;
  v_new_longest     int;
  v_milestones      jsonb;
  v_milestone_node  jsonb;
  v_milestone_points int := 0;
  v_milestone_label text := null;
  v_milestone_mystery boolean := false;
  v_is_milestone    boolean := false;
  v_already         boolean := false;
begin
  if not public.staffs_business(p_business_id) then raise exception 'permission denied'; end if;

  select * into v_cfg from public.streak_config where business_id = p_business_id;
  if v_cfg is null or not v_cfg.is_enabled then
    raise exception 'check-in is not enabled for this business';
  end if;

  v_period_start := public.streak_period_start(v_now, v_cfg.period_type);

  -- Lock the state row (or create it).
  insert into public.member_streaks (business_id, membership_id)
  values (p_business_id, p_membership_id)
  on conflict (business_id, membership_id) do nothing;

  select * into v_state
    from public.member_streaks
   where business_id = p_business_id and membership_id = p_membership_id
   for update;

  -- Already checked in this period? No-op (idempotent).
  if v_state.period_started_at is not null
     and v_state.period_started_at = v_period_start
     and v_state.current_period_checkins >= v_cfg.checkins_required_per_period then
    streak_after       := v_state.current_streak;
    longest_after      := v_state.longest_streak;
    awarded_points     := 0;
    is_milestone       := false;
    milestone_label    := null;
    milestone_mystery_unlocked := false;
    already_checked_in := true;
    return next; return;
  end if;

  -- Compute the previous "should have been completed" period start.
  v_prev_period_start := case v_cfg.period_type
    when 'daily'   then v_period_start - interval '1 day'
    when 'weekly'  then v_period_start - interval '1 week'
    when 'monthly' then v_period_start - interval '1 month'
  end;

  if v_state.current_period_checkins = 0
     or v_state.period_started_at is null
     or v_state.period_started_at <> v_period_start
  then
    -- Fresh period entry. Decide whether to continue the streak or reset.
    if v_state.period_started_at is null then
      v_new_streak := 1;          -- first ever check-in
    elsif v_state.period_started_at = v_prev_period_start
          and v_state.current_period_checkins >= v_cfg.checkins_required_per_period then
      -- Previous period completed → consecutive.
      v_new_streak := v_state.current_streak + 1;
    else
      -- Missed a period → reset to 1.
      v_new_streak := 1;
      -- wipe per-streak milestone claims on reset
      update public.member_streaks
         set claimed_milestones = '{}'::int[]
       where id = v_state.id;
      v_state.claimed_milestones := '{}'::int[];
    end if;

    -- Reset per-period counter for the new period.
    v_state.current_period_checkins := 0;
  else
    v_new_streak := v_state.current_streak;
  end if;

  -- Bump period check-in count.
  v_state.current_period_checkins := v_state.current_period_checkins + 1;

  -- If this check-in completes the period requirement, the streak counts.
  -- (Otherwise the period is still "in progress" — streak doesn't advance yet.)
  if v_state.current_period_checkins < v_cfg.checkins_required_per_period then
    -- Incomplete period — streak unchanged from before unless this is the first ever.
    if v_state.current_streak = 0 then
      v_new_streak := 0;
    else
      v_new_streak := v_state.current_streak;
    end if;
  end if;

  v_new_longest := greatest(v_state.longest_streak, v_new_streak);

  -- Milestone resolution: only on period-completing check-ins where the
  -- streak count just landed on a configured milestone we haven't claimed.
  if v_state.current_period_checkins >= v_cfg.checkins_required_per_period then
    v_milestones := coalesce(v_cfg.milestones, '[]'::jsonb);
    for v_milestone_node in select value from jsonb_array_elements(v_milestones)
    loop
      if (v_milestone_node->>'count')::int = v_new_streak
         and not (v_new_streak = any(coalesce(v_state.claimed_milestones, '{}'::int[])))
      then
        v_milestone_points  := coalesce((v_milestone_node->>'points')::int, 0);
        v_milestone_label   := v_milestone_node->>'label';
        v_milestone_mystery := coalesce((v_milestone_node->>'mystery')::boolean, false);
        v_is_milestone      := true;
        exit;
      end if;
    end loop;
  end if;

  -- Persist state.
  update public.member_streaks set
    current_streak          = v_new_streak,
    longest_streak          = v_new_longest,
    total_checkins          = total_checkins + 1,
    last_checkin_at         = v_now,
    current_period_checkins = v_state.current_period_checkins,
    period_started_at       = v_period_start,
    claimed_milestones      = case when v_is_milestone
                                   then array_append(coalesce(claimed_milestones, '{}'::int[]), v_new_streak)
                                   else claimed_milestones end
   where id = v_state.id;

  -- Award milestone points immediately via points_ledger.
  if v_milestone_points > 0 then
    insert into public.points_ledger
      (business_id, membership_id, delta, rule_type, notes)
    values
      (p_business_id, p_membership_id, v_milestone_points, 'streak_milestone',
       'Streak milestone: ' || coalesce(v_milestone_label, v_new_streak::text));

    update public.business_memberships
       set points_balance = points_balance + v_milestone_points,
           lifetime_points_earned = lifetime_points_earned + v_milestone_points
     where id = p_membership_id;
  end if;

  -- Audit row.
  insert into public.check_in_events
    (business_id, membership_id, streak_after, awarded_points,
     is_milestone, milestone_label, milestone_mystery_unlocked,
     checked_in_by_user_id)
  values
    (p_business_id, p_membership_id, v_new_streak, v_milestone_points,
     v_is_milestone, v_milestone_label, v_milestone_mystery,
     auth.uid());

  -- If a "mystery" milestone unlocked, drop a one-shot bonus spin record by
  -- reusing the customer_messages channel (from CP-18) so the customer sees
  -- "🎉 You unlocked a mystery spin!" in their app.
  if v_milestone_mystery then
    insert into public.customer_messages
      (business_id, membership_id, kind, title, body, expires_at)
    values
      (p_business_id, p_membership_id, 'milestone',
       '🎉 Mystery unlocked!',
       'You hit the ' || coalesce(v_milestone_label, v_new_streak::text) || ' milestone. Tap to spin.',
       now() + interval '14 days');
  end if;

  streak_after       := v_new_streak;
  longest_after      := v_new_longest;
  awarded_points     := v_milestone_points;
  is_milestone       := v_is_milestone;
  milestone_label    := v_milestone_label;
  milestone_mystery_unlocked := v_milestone_mystery;
  already_checked_in := false;
  return next;
end; $$;
grant execute on function public.member_checkin(uuid, uuid) to authenticated;

-- ----- 7. Customer-facing read: streak status + milestone progress -----
create or replace function public.get_streak_status(
  p_business_id   uuid,
  p_membership_id uuid
)
returns table (
  is_enabled         boolean,
  period_type        text,
  checkins_required_per_period int,
  current_streak     int,
  longest_streak     int,
  total_checkins     int,
  last_checkin_at    timestamptz,
  checked_in_this_period boolean,
  milestones         jsonb,
  claimed_milestones int[]
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_cfg   record;
  v_state record;
  v_period_start timestamptz;
begin
  select * into v_cfg from public.streak_config where business_id = p_business_id;
  if v_cfg is null or not v_cfg.is_enabled then
    is_enabled := false;
    return next; return;
  end if;

  v_period_start := public.streak_period_start(now(), v_cfg.period_type);

  select * into v_state from public.member_streaks
   where business_id = p_business_id and membership_id = p_membership_id;

  is_enabled                  := true;
  period_type                 := v_cfg.period_type;
  checkins_required_per_period:= v_cfg.checkins_required_per_period;
  current_streak              := coalesce(v_state.current_streak, 0);
  longest_streak              := coalesce(v_state.longest_streak, 0);
  total_checkins              := coalesce(v_state.total_checkins, 0);
  last_checkin_at             := v_state.last_checkin_at;
  checked_in_this_period      := v_state.period_started_at = v_period_start
                                  and v_state.current_period_checkins >= v_cfg.checkins_required_per_period;
  milestones                  := coalesce(v_cfg.milestones, '[]'::jsonb);
  claimed_milestones          := coalesce(v_state.claimed_milestones, '{}'::int[]);
  return next;
end; $$;
grant execute on function public.get_streak_status(uuid, uuid) to authenticated;
