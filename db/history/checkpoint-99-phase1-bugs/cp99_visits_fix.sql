-- =====================================================================
-- CP-99 · Phase 1 — VISIT DATA FIX (bug #13)
-- =====================================================================
-- Apply in the Supabase SQL editor. Idempotent (CREATE OR REPLACE only;
-- no schema changes, no data rewrites).
--
-- ROOT CAUSE (two stacked problems):
--   1. member_checkin (CP-19/CP-36) NEVER updated business_memberships.
--      visit_count / last_visit_at — check-ins were invisible to the
--      visit metric by design gap.
--   2. WORSE: the CP-44 security rewrite of award_points was based on the
--      CP-01 definition instead of CP-08, silently DROPPING the
--      visit_count/last_visit_at bump for 'visit'/'purchase' rules (and
--      the dormant→active flip). Since CP-44 went live, NOTHING has
--      incremented visit_count at all.
--
-- FIX — one shared definition of a "visit":
--   A visit = at most ONE visit_count increment per rolling 12-hour
--   window per membership, creditable from EITHER path (check-in or
--   visit/purchase point award). last_visit_at always refreshes; the
--   counter only bumps when the previous visit is >12h old. 12h matches
--   the CP-36 check-in cooldown, so a check-in followed by a purchase
--   award in the same stop counts as ONE visit, in either order.
--
-- PRESERVED EXACTLY: CP-44 auth gate on award_points, idempotency,
--   balance/ledger/tier logic, CP-36 12h check-in cooldown, all streak
--   logic, streak milestones, check_in_events audit, mystery unlocks.
--
-- DELIBERATELY NOT RESTORED: the legacy CP-08 per-visit-count
--   milestone_rules bonus (also silently dropped by CP-44, dormant since
--   June). Resurrecting it would surprise-award points. If any business
--   still uses milestone_rules, decide separately.
--
-- OPTIONAL BACKFILL: commented block at the bottom reconstructs
--   historical visit_count/last_visit_at from check_in_events + ledger.
--   Run only after the go-forward fix looks right for a day or two.
-- =====================================================================


-- ─────────────────────────────────────────────────────────────────────
-- 1. award_points — CP-44 definition + restored visit handling
-- ─────────────────────────────────────────────────────────────────────
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
  v_business_id  uuid;
  v_new_balance  integer;
  v_ledger_id    uuid;
  v_existing_id  uuid;
  v_member_biz   uuid;
begin
  -- ── Auth gate (CP-44) — unchanged ─────────────────────────────────
  declare v_owner uuid;
  begin
    select business_id, user_id into v_member_biz, v_owner
      from public.business_memberships where id = p_membership_id;
    if v_member_biz is null then
      raise exception 'membership % not found', p_membership_id;
    end if;
    if not (
      public.staffs_business(v_member_biz)
      or (p_delta < 0 and v_owner = auth.uid())
    ) then
      raise exception 'permission denied: cannot award points here'
        using errcode = '42501';
    end if;
  end;

  -- Idempotency short-circuit — unchanged
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

  -- Lock the membership row to serialize concurrent awards — unchanged
  select business_id, points_balance + p_delta
    into v_business_id, v_new_balance
    from public.business_memberships
   where id = p_membership_id
   for update;

  if v_new_balance < 0 then
    raise exception 'insufficient points (would go to %)', v_new_balance;
  end if;

  -- CP-99: restore the CP-08 visit handling lost in the CP-44 rewrite.
  -- 'visit'/'purchase' rules refresh last_visit_at, flip dormant→active,
  -- and bump visit_count — but the COUNTER only bumps when the previous
  -- visit is more than 12h old (one visit per stop, either path).
  if p_rule_type in ('visit', 'purchase') then
    update public.business_memberships
       set points_balance = v_new_balance,
           lifetime_points_earned = lifetime_points_earned + greatest(p_delta, 0),
           visit_count = case
                           when last_visit_at is null
                             or last_visit_at + interval '12 hours' <= now()
                           then visit_count + 1
                           else visit_count
                         end,
           last_visit_at = now(),
           status = case when status = 'dormant' then 'active' else status end,
           updated_at = now()
     where id = p_membership_id;
  else
    update public.business_memberships
       set points_balance = v_new_balance,
           lifetime_points_earned = lifetime_points_earned + greatest(p_delta, 0),
           updated_at = now()
     where id = p_membership_id;
  end if;

  insert into public.points_ledger
    (membership_id, business_id, delta, rule_type, reference_id, idempotency_key, balance_after, notes, created_by)
  values
    (p_membership_id, v_business_id, p_delta, p_rule_type, p_reference_id, p_idempotency_key, v_new_balance, p_notes, auth.uid())
  returning id into v_ledger_id;

  perform public.recalc_tier(p_membership_id);

  return query select v_ledger_id, v_new_balance;
end; $$;

grant execute on function public.award_points(uuid,integer,text,uuid,text,text) to authenticated;


-- ─────────────────────────────────────────────────────────────────────
-- 2. member_checkin — CP-36 definition + visit bump
-- ─────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.member_checkin(uuid, uuid);

CREATE OR REPLACE FUNCTION public.member_checkin(
  p_business_id   uuid,
  p_membership_id uuid
)
RETURNS TABLE (
  streak_after        int,
  longest_after       int,
  awarded_points      int,
  is_milestone        boolean,
  milestone_label     text,
  milestone_mystery_unlocked boolean,
  already_checked_in  boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
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
BEGIN
  IF NOT public.staffs_business(p_business_id) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  SELECT * INTO v_cfg FROM public.streak_config WHERE business_id = p_business_id;
  IF v_cfg IS NULL OR NOT v_cfg.is_enabled THEN
    RAISE EXCEPTION 'check-in is not enabled for this business';
  END IF;

  v_period_start := public.streak_period_start(v_now, v_cfg.period_type);

  -- Lock the state row (or create it).
  INSERT INTO public.member_streaks (business_id, membership_id)
  VALUES (p_business_id, p_membership_id)
  ON CONFLICT (business_id, membership_id) DO NOTHING;

  SELECT * INTO v_state
    FROM public.member_streaks
   WHERE business_id = p_business_id AND membership_id = p_membership_id
   FOR UPDATE;

  -- CP-36: hard 12-hour cooldown — unchanged.
  IF v_state.last_checkin_at IS NOT NULL
     AND v_state.last_checkin_at + interval '12 hours' > v_now
  THEN
    streak_after       := v_state.current_streak;
    longest_after      := v_state.longest_streak;
    awarded_points     := 0;
    is_milestone       := false;
    milestone_label    := null;
    milestone_mystery_unlocked := false;
    already_checked_in := true;
    RETURN NEXT; RETURN;
  END IF;

  -- Streak continuity — unchanged.
  v_prev_period_start := CASE v_cfg.period_type
    WHEN 'daily'   THEN v_period_start - interval '1 day'
    WHEN 'weekly'  THEN v_period_start - interval '1 week'
    WHEN 'monthly' THEN v_period_start - interval '1 month'
  END;

  IF v_state.current_period_checkins = 0
     OR v_state.period_started_at IS NULL
     OR v_state.period_started_at <> v_period_start
  THEN
    IF v_state.period_started_at IS NULL THEN
      v_new_streak := 1;
    ELSIF v_state.period_started_at = v_prev_period_start
          AND v_state.current_period_checkins >= v_cfg.checkins_required_per_period THEN
      v_new_streak := v_state.current_streak + 1;
    ELSE
      v_new_streak := 1;
      UPDATE public.member_streaks SET claimed_milestones = '{}'::int[] WHERE id = v_state.id;
      v_state.claimed_milestones := '{}'::int[];
    END IF;
    v_state.current_period_checkins := 0;
  ELSE
    v_new_streak := v_state.current_streak;
  END IF;

  v_state.current_period_checkins := v_state.current_period_checkins + 1;

  IF v_state.current_period_checkins < v_cfg.checkins_required_per_period THEN
    IF v_state.current_streak = 0 THEN
      v_new_streak := 0;
    ELSE
      v_new_streak := v_state.current_streak;
    END IF;
  END IF;

  v_new_longest := GREATEST(v_state.longest_streak, v_new_streak);

  -- Streak milestone resolution — unchanged.
  IF v_state.current_period_checkins >= v_cfg.checkins_required_per_period THEN
    v_milestones := COALESCE(v_cfg.milestones, '[]'::jsonb);
    FOR v_milestone_node IN SELECT value FROM jsonb_array_elements(v_milestones)
    LOOP
      IF (v_milestone_node->>'count')::int = v_new_streak
         AND NOT (v_new_streak = ANY(COALESCE(v_state.claimed_milestones, '{}'::int[])))
      THEN
        v_milestone_points  := COALESCE((v_milestone_node->>'points')::int, 0);
        v_milestone_label   := v_milestone_node->>'label';
        v_milestone_mystery := COALESCE((v_milestone_node->>'mystery')::boolean, false);
        v_is_milestone      := true;
        EXIT;
      END IF;
    END LOOP;
  END IF;

  UPDATE public.member_streaks SET
    current_streak          = v_new_streak,
    longest_streak          = v_new_longest,
    total_checkins          = total_checkins + 1,
    last_checkin_at         = v_now,
    current_period_checkins = v_state.current_period_checkins,
    period_started_at       = v_period_start,
    claimed_milestones      = CASE WHEN v_is_milestone
                                   THEN array_append(COALESCE(claimed_milestones, '{}'::int[]), v_new_streak)
                                   ELSE claimed_milestones END
   WHERE id = v_state.id;

  IF v_milestone_points > 0 THEN
    INSERT INTO public.points_ledger
      (business_id, membership_id, delta, rule_type, notes)
    VALUES
      (p_business_id, p_membership_id, v_milestone_points, 'streak_milestone',
       'Streak milestone: ' || COALESCE(v_milestone_label, v_new_streak::text));

    UPDATE public.business_memberships
       SET points_balance = points_balance + v_milestone_points,
           lifetime_points_earned = lifetime_points_earned + v_milestone_points
     WHERE id = p_membership_id;
  END IF;

  -- CP-99: a successful check-in IS a visit. Refresh last_visit_at,
  -- flip dormant→active, and bump visit_count unless a visit was already
  -- credited in the last 12h (e.g. a purchase award moments earlier).
  -- The function's own 12h cooldown guarantees successful check-ins are
  -- spaced, so this cannot double-count check-ins themselves.
  UPDATE public.business_memberships
     SET visit_count = CASE
                         WHEN last_visit_at IS NULL
                           OR last_visit_at + interval '12 hours' <= v_now
                         THEN visit_count + 1
                         ELSE visit_count
                       END,
         last_visit_at = v_now,
         status = CASE WHEN status = 'dormant' THEN 'active' ELSE status END,
         updated_at = now()
   WHERE id = p_membership_id;

  -- Audit row — unchanged.
  INSERT INTO public.check_in_events
    (business_id, membership_id, streak_after, awarded_points,
     is_milestone, milestone_label, milestone_mystery_unlocked,
     checked_in_by_user_id)
  VALUES
    (p_business_id, p_membership_id, v_new_streak, v_milestone_points,
     v_is_milestone, v_milestone_label, v_milestone_mystery,
     auth.uid());

  IF v_milestone_mystery THEN
    INSERT INTO public.customer_messages
      (business_id, membership_id, kind, title, body, expires_at)
    VALUES
      (p_business_id, p_membership_id, 'milestone',
       '🎉 Mystery unlocked!',
       'You hit the ' || COALESCE(v_milestone_label, v_new_streak::text) || ' milestone. Tap to spin.',
       now() + interval '14 days');
  END IF;

  streak_after       := v_new_streak;
  longest_after      := v_new_longest;
  awarded_points     := v_milestone_points;
  is_milestone       := v_is_milestone;
  milestone_label    := v_milestone_label;
  milestone_mystery_unlocked := v_milestone_mystery;
  already_checked_in := false;
  RETURN NEXT;
END;
$$;
GRANT EXECUTE ON FUNCTION public.member_checkin(uuid, uuid) TO authenticated;

notify pgrst, 'reload schema';


-- ─────────────────────────────────────────────────────────────────────
-- 3. OPTIONAL ONE-TIME BACKFILL — leave commented until the go-forward
--    fix has looked right for a day or two, then run once if you want
--    history corrected. Rebuilds visit_count + last_visit_at for every
--    membership from check_in_events ∪ visit/purchase ledger rows,
--    deduped with the same 12h-window rule.
-- ─────────────────────────────────────────────────────────────────────
-- with all_events as (
--   select membership_id, created_at
--     from public.check_in_events
--    where membership_id is not null
--   union all
--   select membership_id, created_at
--     from public.points_ledger
--    where rule_type in ('visit', 'purchase')
-- ),
-- gapped as (
--   select membership_id, created_at,
--          lag(created_at) over (partition by membership_id order by created_at) as prev_at
--     from all_events
-- ),
-- counted as (
--   select membership_id,
--          count(*) filter (where prev_at is null
--                              or created_at - prev_at >= interval '12 hours') as visits,
--          max(created_at) as last_visit
--     from gapped
--    group by membership_id
-- )
-- update public.business_memberships m
--    set visit_count   = c.visits,
--        last_visit_at = greatest(coalesce(m.last_visit_at, c.last_visit), c.last_visit),
--        updated_at    = now()
--   from counted c
--  where c.membership_id = m.id;
