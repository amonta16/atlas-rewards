-- =====================================================================
-- CP-44 — Daily Spin: server-authoritative, exploit-proof award
-- =====================================================================
-- The daily spin previously picked the prize in client JS and called an
-- (undefined) award_checkin_mystery_bonus RPC → it animated "+50" but
-- awarded nothing, and had the client trusted with the amount it would
-- have been exploitable.
--
-- spin_daily_reward picks a weighted-random prize from the agency's
-- configured pool ON THE SERVER, awards it, records the spin (which drives
-- the cooldown in mystery_reward_status), and returns the prize for the
-- client to display. The client cannot influence the amount, can only spin
-- for THEIR OWN membership, must have checked in today, and is hard-capped
-- to one spin per cooldown window (re-checked here under a row lock).
-- =====================================================================

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
  v_enabled     boolean;
  v_cooldown    int;
  v_checked_in  boolean;
  v_last        timestamptz;
  v_total_w     int;
  v_pick        int;
  v_cum         int := 0;
  v_prize       record;
  v_new_bal     int;
begin
  -- 1. Ownership — you can only spin for your own membership.
  select user_id into v_owner
    from public.business_memberships
   where id = p_membership_id and business_id = p_business_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not your membership' using errcode = '42501';
  end if;

  -- 2. Mystery enabled?
  select coalesce(is_enabled, false), coalesce(cooldown_hours, 24)
    into v_enabled, v_cooldown
    from public.business_mystery_config
   where business_id = p_business_id;
  if not coalesce(v_enabled, false) then
    raise exception 'daily spin is not enabled for this business';
  end if;

  -- 3. Must have checked in today (the spin is check-in gated).
  select exists (
    select 1 from public.check_in_events
     where membership_id = p_membership_id
       and created_at >= date_trunc('day', now())
  ) into v_checked_in;
  if not v_checked_in then
    raise exception 'check in first to unlock your spin';
  end if;

  -- 4. Cooldown — lock the membership row to serialize concurrent spins,
  --    then re-check the last spin time. Prevents double-spin races.
  perform 1 from public.business_memberships where id = p_membership_id for update;
  select max(awarded_at) into v_last
    from public.mystery_reward_spins
   where membership_id = p_membership_id;
  if v_last is not null and v_last >= now() - (v_cooldown || ' hours')::interval then
    raise exception 'already spun — come back after the cooldown';
  end if;

  -- 5. Weighted-random prize from the active pool (server-decided).
  select coalesce(sum(weight), 0) into v_total_w
    from public.mystery_reward_pool
   where business_id = p_business_id and is_active;
  if v_total_w = 0 then
    raise exception 'no prizes configured for the daily spin';
  end if;

  v_pick := floor(random() * v_total_w) + 1;
  for v_prize in
    select * from public.mystery_reward_pool
     where business_id = p_business_id and is_active
     order by created_at
  loop
    v_cum := v_cum + v_prize.weight;
    exit when v_cum >= v_pick;
  end loop;

  -- 6. Record the spin (this is what mystery_reward_status reads for cooldown).
  insert into public.mystery_reward_spins (business_id, membership_id, prize_id)
  values (p_business_id, p_membership_id, v_prize.id);

  -- 7. Award by prize kind.
  if v_prize.kind = 'points' and coalesce(v_prize.points_amount, 0) > 0 then
    update public.business_memberships
       set points_balance          = points_balance + v_prize.points_amount,
           lifetime_points_earned  = lifetime_points_earned + v_prize.points_amount,
           updated_at              = now()
     where id = p_membership_id
     returning points_balance into v_new_bal;

    insert into public.points_ledger
      (membership_id, business_id, delta, rule_type, notes, balance_after, created_by)
    values
      (p_membership_id, p_business_id, v_prize.points_amount, 'mystery_bonus',
       'Daily spin: ' || v_prize.prize_name, v_new_bal, auth.uid());

    perform public.recalc_tier(p_membership_id);

  elsif v_prize.kind = 'reward' and v_prize.reward_id is not null then
    -- Won a real reward → drop a free (0-cost) pending redemption so it
    -- appears in their active rewards and can be claimed at the desk.
    insert into public.redemptions
      (membership_id, reward_id, business_id, point_cost, code, status, expires_at)
    values
      (p_membership_id, v_prize.reward_id, p_business_id, 0,
       public.generate_redemption_code(p_business_id), 'pending', now() + interval '30 days');
    select points_balance into v_new_bal from public.business_memberships where id = p_membership_id;

  else
    -- coupon (or misconfigured) → nothing to mutate; client shows the code.
    select points_balance into v_new_bal from public.business_memberships where id = p_membership_id;
  end if;

  return query
    select v_prize.id, v_prize.prize_name, v_prize.prize_description,
           v_prize.prize_image_url, v_prize.kind, v_prize.points_amount,
           v_prize.coupon_code, v_new_bal;
end; $$;

grant execute on function public.spin_daily_reward(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
