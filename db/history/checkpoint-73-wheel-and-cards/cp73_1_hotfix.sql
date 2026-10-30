-- ════════════════════════════════════════════════════════════════════════
-- CP-73.1 — HOTFIX. Run AFTER cp73_migration.sql.
--
-- 1. FIX: spinning threw `column reference "kind" is ambiguous`.
--    spin_daily_reward RETURNS TABLE(... kind ...), and in PL/pgSQL those
--    output columns are variables — so cp73's unqualified
--    `and kind <> 'coupon'` clashed with the output column. Every pool
--    query now uses a table alias (mrp.kind).
--
-- 2. Reward prizes REUSE the reward's own image — no separate upload.
--    - mystery_wheel_segments: wedge image = prize_image_url, falling
--      back to the linked reward's image_url.
--    - spin_daily_reward: the win-reveal image gets the same fallback.
-- ════════════════════════════════════════════════════════════════════════

-- ----- 1+2. Wheel segments v3: alias-qualified + reward-image fallback -----
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
      mrp.id,
      mrp.kind,
      case
        when mrp.kind = 'points' then coalesce(mrp.points_amount, 0)::text || ' points'
        else mrp.prize_name
      end as label,
      mrp.points_amount,
      -- CP-73.1: reward prizes fall back to the reward's own photo.
      coalesce(mrp.prize_image_url, r.image_url) as image_url,
      mrp.created_at
    from public.mystery_reward_pool mrp
    left join public.rewards r on r.id = mrp.reward_id
    where mrp.business_id = p_business_id
      and mrp.is_active
      and mrp.kind <> 'coupon'
    order by mrp.created_at
    limit 12
  )
  select pool.id, pool.kind, pool.label, pool.points_amount, pool.image_url from pool
  union all
  select * from (
    values
      (null::uuid, 'points', '50 points',  50,  null::text),
      (null::uuid, 'points', '100 points', 100, null::text),
      (null::uuid, 'points', '300 points', 300, null::text)
  ) as d(id, kind, label, points_amount, image_url)
  where not exists (select 1 from pool);
$$;
grant execute on function public.mystery_wheel_segments(uuid) to authenticated, anon;

-- ----- 1+2. Spin: alias-qualified pool queries + reveal-image fallback -----
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
  v_coupon      text := null;   -- coupons removed (CP-73); kept for API compat
  v_reward_id   uuid;
  v_r           float;
begin
  -- 1. Ownership.
  select bm.user_id into v_owner
    from public.business_memberships bm
   where bm.id = p_membership_id and bm.business_id = p_business_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not your membership' using errcode = '42501';
  end if;

  -- CP-68: demo apps skip the check-in + already-spun gates entirely.
  select coalesce(b.is_demo, false) into v_demo
    from public.businesses b where b.id = p_business_id;

  -- 2. Must have checked in today (skipped for demo apps).
  if not v_demo then
    select exists (
      select 1 from public.check_in_events ce
       where ce.membership_id = p_membership_id
         and ce.created_at >= date_trunc('day', now())
    ) into v_checked_in;
    if not v_checked_in then
      raise exception 'check in first to unlock your spin';
    end if;
  end if;

  -- 3. CP-73: one spin per day — in sync with the daily check-in.
  if not v_demo then
    perform 1 from public.business_memberships bm where bm.id = p_membership_id for update;
    select max(mrs.awarded_at) into v_last
      from public.mystery_reward_spins mrs
     where mrs.membership_id = p_membership_id;
    if v_last is not null and v_last >= date_trunc('day', now()) then
      raise exception 'already spun — come back after the cooldown';
    end if;
  end if;

  -- 4. Pick the prize (coupons excluded; CP-73.1: alias-qualified — the
  --    bare `kind` collided with this function's OUT column).
  select coalesce(sum(mrp.weight), 0) into v_total_w
    from public.mystery_reward_pool mrp
   where mrp.business_id = p_business_id
     and mrp.is_active
     and mrp.kind <> 'coupon';

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
      select * from public.mystery_reward_pool mrp
       where mrp.business_id = p_business_id
         and mrp.is_active
         and mrp.kind <> 'coupon'
       order by mrp.created_at
    loop
      v_cum := v_cum + v_pool.weight;
      exit when v_cum >= v_pick;
    end loop;
    v_prize_id := v_pool.id;  v_name := v_pool.prize_name;  v_desc := v_pool.prize_description;
    v_img := v_pool.prize_image_url;  v_kind := v_pool.kind;  v_points := v_pool.points_amount;
    v_reward_id := v_pool.reward_id;

    -- CP-73.1: reward prizes reuse the reward's own photo on the reveal.
    if v_kind = 'reward' and v_img is null and v_reward_id is not null then
      select r.image_url into v_img from public.rewards r where r.id = v_reward_id;
    end if;
  end if;

  -- 5. Record the spin (prize_id may be null for default prizes).
  insert into public.mystery_reward_spins (business_id, membership_id, prize_id)
  values (p_business_id, p_membership_id, v_prize_id);

  -- 6. Award by kind.
  if v_kind = 'points' and coalesce(v_points, 0) > 0 then
    update public.business_memberships bm
       set points_balance         = bm.points_balance + v_points,
           lifetime_points_earned = bm.lifetime_points_earned + v_points,
           updated_at             = now()
     where bm.id = p_membership_id
     returning bm.points_balance into v_new_bal;
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
    select bm.points_balance into v_new_bal from public.business_memberships bm where bm.id = p_membership_id;

  else
    select bm.points_balance into v_new_bal from public.business_memberships bm where bm.id = p_membership_id;
  end if;

  return query select v_prize_id, v_name, v_desc, v_img, v_kind, v_points, v_coupon, v_new_bal;
end; $$;

grant execute on function public.spin_daily_reward(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
