-- ════════════════════════════════════════════════════════════════════════
-- CP-73 — wheel visuals + check-in-synced spins + points-card styles
--
-- 1. businesses.points_card_style — Home points-card design preset
--    (classic/shiny/fun/sleek/simple — lib/points-card-styles.ts).
-- 2. Coupons removed from the Prize Wheel: existing coupon prizes are
--    deactivated, and every wheel/spin function ignores kind='coupon'.
-- 3. mystery_wheel_segments v2 — adds image_url (prize photos render on
--    the wedges) and excludes coupons.
-- 4. Spin availability is now IN SYNC WITH CHECK-IN — the cooldown_hours
--    setting is gone. The rule is simply: checked in today → one spin
--    today. (business_mystery_config stays in the schema but is no
--    longer read.)
--
-- Run AFTER cp72_wheel_segments.sql. Idempotent.
-- ════════════════════════════════════════════════════════════════════════

-- ----- 1. Points-card style column -----
alter table public.businesses
  add column if not exists points_card_style text;

comment on column public.businesses.points_card_style is
  'CP-73: Home points-card preset (classic/shiny/fun/sleek/simple — lib/points-card-styles.ts). NULL = classic.';

-- ----- 2. Coupons out of the pool -----
update public.mystery_reward_pool
   set is_active = false
 where kind = 'coupon'
   and is_active;

-- ----- 3. Wheel segments v2: + image_url, no coupons -----
drop function if exists public.mystery_wheel_segments(uuid);
create or replace function public.mystery_wheel_segments(p_business_id uuid)
returns table (id uuid, kind text, label text, points_amount int, image_url text)
language sql
stable
security definer
set search_path = public
as $$
  with pool as (
    select
      p.id,
      p.kind,
      case
        when p.kind = 'points' then coalesce(p.points_amount, 0)::text || ' points'
        else p.prize_name
      end as label,
      p.points_amount,
      p.prize_image_url as image_url,
      p.created_at
    from public.mystery_reward_pool p
    where p.business_id = p_business_id
      and p.is_active
      and p.kind <> 'coupon'          -- CP-73: coupons removed
    order by p.created_at
    limit 12
  )
  select id, kind, label, points_amount, image_url from pool
  union all
  -- Built-in default wheel when no pool is configured (matches
  -- spin_daily_reward's 80/15/5 defaults).
  select * from (
    values
      (null::uuid, 'points', '50 points',  50,  null::text),
      (null::uuid, 'points', '100 points', 100, null::text),
      (null::uuid, 'points', '300 points', 300, null::text)
  ) as d(id, kind, label, points_amount, image_url)
  where not exists (select 1 from pool);
$$;
grant execute on function public.mystery_wheel_segments(uuid) to authenticated, anon;

-- ----- 4a. Status: available = checked-in day with no spin yet -----
create or replace function public.mystery_reward_status(
  p_business_id   uuid,
  p_membership_id uuid
)
returns table (is_available boolean, next_spin_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  v_last  timestamptz;
  v_demo  boolean;
begin
  -- CP-68: demo apps are always available.
  select coalesce(is_demo, false) into v_demo
    from public.businesses where id = p_business_id;
  if v_demo then
    is_available := true; next_spin_at := null;
    return next;
    return;
  end if;

  -- CP-73: no cooldown — one spin per day, unlocked by the day's check-in.
  select max(awarded_at) into v_last
    from public.mystery_reward_spins
   where membership_id = p_membership_id;

  if v_last is null or v_last < date_trunc('day', now()) then
    is_available := true; next_spin_at := null;
  else
    is_available := false;
    next_spin_at := date_trunc('day', now()) + interval '1 day';
  end if;
  return next;
end; $$;
grant execute on function public.mystery_reward_status(uuid, uuid) to authenticated;

-- ----- 4b. Spin: check-in today + not yet spun today -----
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
  v_coupon      text := null;   -- CP-73: coupons removed; column kept for API compat
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

  -- CP-68: demo apps skip the check-in + already-spun gates entirely.
  select coalesce(is_demo, false) into v_demo
    from public.businesses where id = p_business_id;

  -- 2. Must have checked in today (skipped for demo apps).
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

  -- 3. CP-73: one spin per day — in sync with the daily check-in.
  --    (Replaces the old cooldown_hours config.) Row lock guards racing taps.
  if not v_demo then
    perform 1 from public.business_memberships where id = p_membership_id for update;
    select max(awarded_at) into v_last
      from public.mystery_reward_spins
     where membership_id = p_membership_id;
    if v_last is not null and v_last >= date_trunc('day', now()) then
      raise exception 'already spun — come back after the cooldown';
    end if;
  end if;

  -- 4. Pick the prize (coupons excluded — CP-73).
  select coalesce(sum(weight), 0) into v_total_w
    from public.mystery_reward_pool
   where business_id = p_business_id and is_active and kind <> 'coupon';

  if v_total_w = 0 then
    -- No pool configured → built-in default point prizes (80/15/5).
    v_r := random();
    if v_r < 0.05 then v_points := 300; v_name := 'Jackpot — 300 points';
    elsif v_r < 0.20 then v_points := 100; v_name := 'Lucky — 100 points';
    else v_points := 50; v_name := 'Nice spin — 50 points'; end if;
    v_kind := 'points'; v_prize_id := null; v_desc := null; v_img := null; v_reward_id := null;
  else
    v_pick := floor(random() * v_total_w) + 1;
    for v_pool in
      select * from public.mystery_reward_pool
       where business_id = p_business_id and is_active and kind <> 'coupon'
       order by created_at
    loop
      v_cum := v_cum + v_pool.weight;
      exit when v_cum >= v_pick;
    end loop;
    v_prize_id := v_pool.id;  v_name := v_pool.prize_name;  v_desc := v_pool.prize_description;
    v_img := v_pool.prize_image_url;  v_kind := v_pool.kind;  v_points := v_pool.points_amount;
    v_reward_id := v_pool.reward_id;
  end if;

  -- 5. Record the spin (prize_id may be null for default prizes).
  insert into public.mystery_reward_spins (business_id, membership_id, prize_id)
  values (p_business_id, p_membership_id, v_prize_id);

  -- 6. Award by kind.
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
