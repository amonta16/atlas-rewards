-- =====================================================================
-- Atlas · CP-121 — tap-to-claim streak gifts
-- =====================================================================
-- Streak milestone prizes are no longer auto-credited on check-in.
-- Hitting a milestone now EARNS a gift that sits on the streak roadmap
-- until the member TAPS it to claim — the unwrap moment lives on the
-- streak page (gamification), and the Streaks tab badge can say "you
-- have a gift waiting".
--
--  · member_streak_gifts table — earned gifts; claimable for 7 DAYS
--    from earning (Andrew's call: survives a streak break, but not
--    forever).
--  · member_checkin: on milestone, inserts a gift row instead of
--    crediting points. Mystery milestones keep their existing spin flow
--    (customer_messages) unchanged.
--  · claim_streak_gift(gift): the member taps to claim —
--       points gift  → points credited to their balance (ledger row)
--       reward gift  → a zero-cost pending REDEMPTION with a desk code
--                      (fulfilled at the counter exactly like any other
--                      redemption — scan/type the code)
--  · list_streak_gifts: gifts for the streak page + tab badge (member
--    or staff).
--
-- Safe to run on production, transactional, re-runnable. Run AFTER
-- cp120. Deploy the app together with this (the streak page gains the
-- claim UI; old clients simply keep showing milestones as before).
--
-- NOTE ON IN-FLIGHT STREAKS: milestones ALREADY paid out before this
-- migration stay paid (claimed_milestones marks them) — nothing is
-- retroactively converted, no double pay.
-- =====================================================================

begin;

-- ── 1. earned-gift ledger ────────────────────────────────────────────
create table if not exists public.member_streak_gifts (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  membership_id   uuid not null references public.business_memberships(id) on delete cascade,
  milestone_count int  not null,
  label           text,
  gift_kind       text not null default 'points' check (gift_kind in ('points','reward')),
  points          int  not null default 0,
  reward_id       uuid references public.rewards(id) on delete set null,
  earned_at       timestamptz not null default now(),
  expires_at      timestamptz not null default now() + interval '7 days',
  claimed_at      timestamptz,
  redemption_id   uuid references public.redemptions(id) on delete set null
);

create index if not exists msg_unclaimed_idx
  on public.member_streak_gifts (membership_id, business_id)
  where claimed_at is null;

-- RPC-only access (CP-109 style): RLS on, no policies — every read and
-- write goes through the SECURITY DEFINER functions below.
alter table public.member_streak_gifts enable row level security;

-- ── 2. member_checkin — milestone now EARNS a gift ──────────────────
-- (CP-99 body; the only change is the milestone payout block.)
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
  v_cfg               record;
  v_state             record;
  v_now               timestamptz := now();
  v_period_start      timestamptz;
  v_prev_period_start timestamptz;
  v_new_streak        int;
  v_new_longest       int;
  v_milestones        jsonb;
  v_milestone_node    jsonb;
  v_milestone_points  int := 0;
  v_milestone_label   text := null;
  v_milestone_mystery boolean := false;
  v_is_milestone      boolean := false;
  -- CP-121: gift capture
  v_gift_kind         text := null;
  v_gift_reward_id    uuid := null;
begin
  if not public.staffs_business(p_business_id) then
    raise exception 'permission denied';
  end if;

  select * into v_cfg from public.streak_config where business_id = p_business_id;
  if v_cfg is null or not v_cfg.is_enabled then
    raise exception 'check-in is not enabled for this business';
  end if;

  v_period_start := public.streak_period_start(v_now, v_cfg.period_type);

  insert into public.member_streaks (business_id, membership_id)
  values (p_business_id, p_membership_id)
  on conflict (business_id, membership_id) do nothing;

  select * into v_state
    from public.member_streaks
   where business_id = p_business_id and membership_id = p_membership_id
   for update;

  -- CP-36: hard 12-hour cooldown — unchanged.
  if v_state.last_checkin_at is not null
     and v_state.last_checkin_at + interval '12 hours' > v_now
  then
    streak_after       := v_state.current_streak;
    longest_after      := v_state.longest_streak;
    awarded_points     := 0;
    is_milestone       := false;
    milestone_label    := null;
    milestone_mystery_unlocked := false;
    already_checked_in := true;
    return next; return;
  end if;

  -- Streak continuity — unchanged.
  v_prev_period_start := case v_cfg.period_type
    when 'daily'   then v_period_start - interval '1 day'
    when 'weekly'  then v_period_start - interval '1 week'
    when 'monthly' then v_period_start - interval '1 month'
  end;

  if v_state.current_period_checkins = 0
     or v_state.period_started_at is null
     or v_state.period_started_at <> v_period_start
  then
    if v_state.period_started_at is null then
      v_new_streak := 1;
    elsif v_state.period_started_at = v_prev_period_start
          and v_state.current_period_checkins >= v_cfg.checkins_required_per_period then
      v_new_streak := v_state.current_streak + 1;
    else
      v_new_streak := 1;
      update public.member_streaks set claimed_milestones = '{}'::int[] where id = v_state.id;
      v_state.claimed_milestones := '{}'::int[];
    end if;
    v_state.current_period_checkins := 0;
  else
    v_new_streak := v_state.current_streak;
  end if;

  v_state.current_period_checkins := v_state.current_period_checkins + 1;

  if v_state.current_period_checkins < v_cfg.checkins_required_per_period then
    if v_state.current_streak = 0 then
      v_new_streak := 0;
    else
      v_new_streak := v_state.current_streak;
    end if;
  end if;

  v_new_longest := greatest(v_state.longest_streak, v_new_streak);

  -- Milestone resolution — unchanged, plus gift_kind / reward_id capture.
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
        v_gift_kind         := coalesce(v_milestone_node->>'gift_kind',
                                        case when nullif(v_milestone_node->>'reward_id','') is not null
                                             then 'reward' else 'points' end);
        v_gift_reward_id    := nullif(v_milestone_node->>'reward_id','')::uuid;
        v_is_milestone      := true;
        exit;
      end if;
    end loop;
  end if;

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

  -- ── CP-121: EARN a gift instead of paying out immediately. ─────────
  -- The member claims it by tapping the milestone on their streak page
  -- (7-day window). Mystery milestones keep the spin flow below.
  if v_is_milestone and not v_milestone_mystery
     and (v_milestone_points > 0 or (v_gift_kind = 'reward' and v_gift_reward_id is not null))
  then
    insert into public.member_streak_gifts
      (business_id, membership_id, milestone_count, label, gift_kind, points, reward_id)
    values
      (p_business_id, p_membership_id, v_new_streak, v_milestone_label,
       case when v_gift_kind = 'reward' and v_gift_reward_id is not null then 'reward' else 'points' end,
       v_milestone_points, v_gift_reward_id);
  end if;

  -- CP-99: a successful check-in IS a visit — unchanged.
  update public.business_memberships
     set visit_count = case
                         when last_visit_at is null
                           or last_visit_at + interval '12 hours' <= v_now
                         then visit_count + 1
                         else visit_count
                       end,
         last_visit_at = v_now,
         status = case when status = 'dormant' then 'active' else status end,
         updated_at = now()
   where id = p_membership_id;

  -- Audit row — awarded_points logs 0 now (payout happens at claim).
  insert into public.check_in_events
    (business_id, membership_id, streak_after, awarded_points,
     is_milestone, milestone_label, milestone_mystery_unlocked,
     checked_in_by_user_id)
  values
    (p_business_id, p_membership_id, v_new_streak, 0,
     v_is_milestone, v_milestone_label, v_milestone_mystery,
     auth.uid());

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
  awarded_points     := 0;
  is_milestone       := v_is_milestone;
  milestone_label    := v_milestone_label;
  milestone_mystery_unlocked := v_milestone_mystery;
  already_checked_in := false;
  return next;
end;
$$;
grant execute on function public.member_checkin(uuid, uuid) to authenticated;

-- ── 3. claim a gift (the member, from their own app) ────────────────
create or replace function public.claim_streak_gift(p_gift_id uuid)
returns table (
  gift_kind        text,
  points           int,
  reward_id        uuid,
  reward_name      text,
  reward_image_url text,
  redemption_code  text
)
language plpgsql security definer set search_path = public as $$
declare
  v_g      record;
  v_uid    uuid := auth.uid();
  v_code   text := null;
  v_red_id uuid := null;
  v_rname  text := null;
  v_rimg   text := null;
begin
  select g.*, m.user_id as member_user_id
    into v_g
    from public.member_streak_gifts g
    join public.business_memberships m on m.id = g.membership_id
   where g.id = p_gift_id
   for update of g;

  if v_g.id is null then
    raise exception 'gift not found';
  end if;
  if v_g.member_user_id is distinct from v_uid then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if v_g.claimed_at is not null then
    raise exception 'already claimed';
  end if;
  if v_g.expires_at <= now() then
    raise exception 'this gift has expired';
  end if;

  if v_g.gift_kind = 'reward' and v_g.reward_id is not null then
    select r.name, r.image_url into v_rname, v_rimg
      from public.rewards r where r.id = v_g.reward_id;
    v_code := public.generate_redemption_code(v_g.business_id);
    insert into public.redemptions
      (membership_id, reward_id, business_id, point_cost, code, status, expires_at)
    values
      (v_g.membership_id, v_g.reward_id, v_g.business_id, 0, v_code, 'pending',
       now() + interval '30 days')
    returning id into v_red_id;
  elsif v_g.points > 0 then
    insert into public.points_ledger
      (business_id, membership_id, delta, rule_type, notes)
    values
      (v_g.business_id, v_g.membership_id, v_g.points, 'streak_milestone',
       'Streak gift claimed: ' || coalesce(v_g.label, v_g.milestone_count::text));
    update public.business_memberships
       set points_balance = points_balance + v_g.points,
           lifetime_points_earned = lifetime_points_earned + v_g.points
     where id = v_g.membership_id;
  end if;

  update public.member_streak_gifts
     set claimed_at = now(), redemption_id = v_red_id
   where id = p_gift_id;

  gift_kind        := v_g.gift_kind;
  points           := v_g.points;
  reward_id        := v_g.reward_id;
  reward_name      := v_rname;
  reward_image_url := v_rimg;
  redemption_code  := v_code;
  return next;
end; $$;
grant execute on function public.claim_streak_gift(uuid) to authenticated;

-- ── 4. list gifts (member sees own; staff see any member's) ─────────
create or replace function public.list_streak_gifts(
  p_business_id   uuid,
  p_membership_id uuid
)
returns table (
  gift_id          uuid,
  milestone_count  int,
  label            text,
  gift_kind        text,
  points           int,
  reward_id        uuid,
  reward_name      text,
  reward_image_url text,
  earned_at        timestamptz,
  expires_at       timestamptz,
  claimed_at       timestamptz,
  redemption_code  text,
  redemption_status text
)
language sql stable security definer set search_path = public as $$
  select g.id, g.milestone_count, g.label::text, g.gift_kind::text, g.points,
         g.reward_id, r.name::text, r.image_url::text,
         g.earned_at, g.expires_at, g.claimed_at,
         rd.code::text, rd.status::text
    from public.member_streak_gifts g
    join public.business_memberships m on m.id = g.membership_id
    left join public.rewards r      on r.id = g.reward_id
    left join public.redemptions rd on rd.id = g.redemption_id
   where g.membership_id = p_membership_id
     and g.business_id = p_business_id
     and (m.user_id = auth.uid() or public.staffs_business(p_business_id))
     -- unclaimed + not expired, plus recently-claimed (so the page can
     -- show the code again / a claimed state for 30 days)
     and (
       (g.claimed_at is null and g.expires_at > now())
       or g.claimed_at > now() - interval '30 days'
     )
   order by g.earned_at desc;
$$;
grant execute on function public.list_streak_gifts(uuid, uuid) to authenticated;

commit;

notify pgrst, 'reload schema';

-- =====================================================================
-- After applying + deploying:
--  · Check in at the desk past a milestone → the streak page shows the
--    milestone card glowing gold "GIFT READY — tap to claim".
--  · Tapping claims it: points land with a count-up; reward gifts show
--    a desk code (also resolvable by the front-desk code box).
--  · Streaks tab badge: gold gift = unclaimed gift; red "!" = streak
--    about to expire; gift with red ring = both.
-- =====================================================================
