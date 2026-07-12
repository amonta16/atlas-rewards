-- =====================================================================
-- CP-68 — Reward games + demo mode (run any time; idempotent)
-- =====================================================================
-- 1. businesses.reward_game — which mini-game plays for the check-in
--    reward: slot (default) | wheel | boxes. Pure presentation; prizes
--    are still picked server-side below.
-- 2. businesses.is_demo — pitch-demo apps. For demo apps the reward
--    game skips BOTH gates (must-check-in-today + cooldown) so the
--    agency can replay the reward moment endlessly during a pitch.
--    Prizes still award normally (it's demo data anyway).
-- 3. Re-creates mystery_reward_status + spin_daily_reward (from CP-44)
--    with the is_demo bypass added. Everything else is unchanged.
-- =====================================================================

alter table public.businesses
  add column if not exists reward_game text,
  add column if not exists is_demo boolean not null default false;

comment on column public.businesses.reward_game is
  'CP-68: check-in reward game id (slot/wheel/boxes — lib/reward-games.ts). NULL = slot.';
comment on column public.businesses.is_demo is
  'CP-68: demo app for pitching — reward game skips check-in + cooldown gates.';

-- ----- Status: ready / cooldown (drives the spin button) -----
create or replace function public.mystery_reward_status(
  p_business_id   uuid,
  p_membership_id uuid
)
returns table (is_available boolean, next_spin_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  v_cooldown   int;
  v_last       timestamptz;
  v_demo       boolean;
begin
  -- CP-68: demo apps are always available.
  select coalesce(is_demo, false) into v_demo
    from public.businesses where id = p_business_id;
  if v_demo then
    is_available := true; next_spin_at := null;
    return next;
    return;
  end if;

  select coalesce(cooldown_hours, 24) into v_cooldown
    from public.business_mystery_config
   where business_id = p_business_id;
  v_cooldown := coalesce(v_cooldown, 24);

  select max(awarded_at) into v_last
    from public.mystery_reward_spins
   where membership_id = p_membership_id;

  if v_last is null or v_last < now() - (v_cooldown || ' hours')::interval then
    is_available := true; next_spin_at := null;
  else
    is_available := false; next_spin_at := v_last + (v_cooldown || ' hours')::interval;
  end if;
  return next;
end; $$;
grant execute on function public.mystery_reward_status(uuid, uuid) to authenticated;

-- ----- Spin: pick + award server-side (CP-44 body + CP-68 demo bypass) -----
create or replace function public.spin_daily_reward(
  p_business_id   uuid,
  p_membership_id uuid
)
returns table (
  prize_id          uuid,
  prize_name        text,
  prize_description text,
  prize_image_url   text,
  kind              text,
  points_amount     int,
  coupon_code       text,
  new_balance       int
)
language plpgsql security definer set search_path = public as $$
declare
  v_owner       uuid;
  v_cooldown    int;
  v_checked_in  boolean;
  v_last        timestamptz;
  v_total_w     int;
  v_pick        int;
  v_cum         int := 0;
  v_pool        record;
  v_new_bal     int;
  v_demo        boolean;
  -- resolved prize (from pool OR default)
  v_prize_id    uuid;
  v_name        text;
  v_desc        text;
  v_img         text;
  v_kind        text;
  v_points      int;
  v_coupon      text;
  v_reward_id   uuid;
  v_r           float;
begin
  -- 1. Ownership.
  select user_id into v_owner
    from public.business_memberships
   where id = p_membership_id and business_id = p_business_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not your membership' using errcode = '42501';
  end if;

  -- CP-68: demo apps skip the check-in + cooldown gates entirely.
  select coalesce(is_demo, false) into v_demo
    from public.businesses where id = p_business_id;

  -- 2. Cooldown config (CP-44.1: always on; gated only by check-in + cooldown).
  select coalesce(cooldown_hours, 24) into v_cooldown
    from public.business_mystery_config
   where business_id = p_business_id;
  v_cooldown := coalesce(v_cooldown, 24);

  -- 3. Must have checked in today (skipped for demo apps).
  if not v_demo then
    select exists (
      select 1 from public.check_in_events
       where membership_id = p_membership_id
         and created_at >= date_trunc('day', now())
    ) into v_checked_in;
    if not v_checked_in then
      raise exception 'check in first to unlock your spin';
    end if;
  end if;

  -- 4. Cooldown, under a row lock (skipped for demo apps).
  if not v_demo then
    perform 1 from public.business_memberships where id = p_membership_id for update;
    select max(awarded_at) into v_last
      from public.mystery_reward_spins
     where membership_id = p_membership_id;
    if v_last is not null and v_last >= now() - (v_cooldown || ' hours')::interval then
      raise exception 'already spun — come back after the cooldown';
    end if;
  end if;

  -- 5. Pick the prize.
  select coalesce(sum(weight), 0) into v_total_w
    from public.mystery_reward_pool
   where business_id = p_business_id and is_active;

  if v_total_w = 0 then
    -- No pool configured → built-in default point prizes (80/15/5).
    v_r := random();
    if v_r < 0.05 then v_points := 300; v_name := 'Jackpot — 300 points';
    elsif v_r < 0.20 then v_points := 100; v_name := 'Lucky — 100 points';
    else v_points := 50; v_name := 'Nice spin — 50 points'; end if;
    v_kind := 'points'; v_prize_id := null; v_desc := null; v_img := null; v_coupon := null; v_reward_id := null;
  else
    v_pick := floor(random() * v_total_w) + 1;
    for v_pool in
      select * from public.mystery_reward_pool
       where business_id = p_business_id and is_active
       order by created_at
    loop
      v_cum := v_cum + v_pool.weight;
      exit when v_cum >= v_pick;
    end loop;
    v_prize_id := v_pool.id;  v_name := v_pool.prize_name;  v_desc := v_pool.prize_description;
    v_img := v_pool.prize_image_url;  v_kind := v_pool.kind;  v_points := v_pool.points_amount;
    v_coupon := v_pool.coupon_code;  v_reward_id := v_pool.reward_id;
  end if;

  -- 6. Record the spin (prize_id may be null for default prizes).
  insert into public.mystery_reward_spins (business_id, membership_id, prize_id)
  values (p_business_id, p_membership_id, v_prize_id);

  -- 7. Award by kind.
  if v_kind = 'points' and coalesce(v_points, 0) > 0 then
    update public.business_memberships
       set points_balance         = points_balance + v_points,
           lifetime_points_earned = lifetime_points_earned + v_points,
           updated_at             = now()
     where id = p_membership_id
     returning points_balance into v_new_bal;
    insert into public.points_ledger
      (membership_id, business_id, delta, rule_type, notes, balance_after, created_by)
    values
      (p_membership_id, p_business_id, v_points, 'mystery_bonus',
       'Daily spin: ' || v_name, v_new_bal, auth.uid());
    perform public.recalc_tier(p_membership_id);

  elsif v_kind = 'reward' and v_reward_id is not null then
    insert into public.redemptions
      (membership_id, reward_id, business_id, point_cost, code, status, expires_at)
    values
      (p_membership_id, v_reward_id, p_business_id, 0,
       public.generate_redemption_code(p_business_id), 'pending', now() + interval '30 days');
    select points_balance into v_new_bal from public.business_memberships where id = p_membership_id;

  else
    select points_balance into v_new_bal from public.business_memberships where id = p_membership_id;
  end if;

  return query select v_prize_id, v_name, v_desc, v_img, v_kind, v_points, v_coupon, v_new_bal;
end; $$;

grant execute on function public.spin_daily_reward(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
