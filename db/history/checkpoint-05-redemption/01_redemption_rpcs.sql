-- =====================================================================
-- CHECKPOINT 5 — Rewards redemption RPCs
-- =====================================================================

-- Generate a 7-char alphanumeric redemption code, retrying on collision.
-- Excludes 0/O/1/I to avoid confusion at the front desk.
create or replace function public.generate_redemption_code(p_business_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  alphabet text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_code   text;
  v_taken  boolean;
  i int;
begin
  loop
    v_code := '';
    for i in 1..7 loop
      v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    select exists (
      select 1 from public.redemptions where business_id = p_business_id and code = v_code
    ) into v_taken;
    exit when not v_taken;
  end loop;
  return v_code;
end; $$;

-- =====================================================================
-- redeem_reward: customer-facing. Atomic point deduction + redemption row creation.
-- =====================================================================
create or replace function public.redeem_reward(
  p_reward_id  uuid
)
returns table (redemption_id uuid, code text, new_balance integer)
language plpgsql security definer set search_path = public as $$
declare
  v_business_id  uuid;
  v_point_cost   integer;
  v_reward_name  text;
  v_membership   record;
  v_code         text;
  v_redemption   uuid;
  v_award_result record;
begin
  -- Look up the reward
  select business_id, point_cost, name
    into v_business_id, v_point_cost, v_reward_name
    from public.rewards
   where id = p_reward_id and is_active = true;

  if v_business_id is null then
    raise exception 'reward not found or not active';
  end if;

  -- Look up the caller's membership at this business
  select id, points_balance into v_membership
    from public.business_memberships
   where business_id = v_business_id and user_id = auth.uid()
   for update;

  if v_membership.id is null then
    raise exception 'you are not a member of this business';
  end if;

  if v_membership.points_balance < v_point_cost then
    raise exception 'not enough points (need %, have %)', v_point_cost, v_membership.points_balance;
  end if;

  -- Generate a unique code for this business
  v_code := public.generate_redemption_code(v_business_id);

  -- Create the redemption row first (so reference_id on the ledger points to it)
  insert into public.redemptions
    (membership_id, reward_id, business_id, point_cost, code, status, expires_at)
  values
    (v_membership.id, p_reward_id, v_business_id, v_point_cost, v_code, 'pending',
     now() + interval '30 days')
  returning id into v_redemption;

  -- Deduct points (negative delta) via the existing engine.
  -- This handles balance update, tier recalc, and ledger atomically.
  select * into v_award_result from public.award_points(
    v_membership.id,
    -v_point_cost,
    'redemption',
    v_redemption,
    'redeem_' || v_redemption,
    'Redeemed: ' || v_reward_name
  );

  return query select v_redemption, v_code, v_award_result.new_balance;
end; $$;

grant execute on function public.redeem_reward(uuid) to authenticated;

-- =====================================================================
-- resolve_redemption_by_code: manager-side lookup
-- =====================================================================
create or replace function public.resolve_redemption_by_code(p_code text, p_business_id uuid)
returns table (
  redemption_id uuid, reward_id uuid, membership_id uuid,
  reward_name text, reward_description text, reward_type text,
  point_cost integer, status text, code text,
  member_name text, member_email text,
  created_at timestamptz, expires_at timestamptz, fulfilled_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select r.id, r.reward_id, r.membership_id,
         rw.name, rw.description, rw.reward_type,
         r.point_cost, r.status, r.code,
         p.full_name, p.email,
         r.created_at, r.expires_at, r.fulfilled_at
    from public.redemptions r
    join public.rewards rw            on rw.id = r.reward_id
    join public.business_memberships m on m.id = r.membership_id
    join public.profiles p             on p.id = m.user_id
   where r.code = upper(p_code) and r.business_id = p_business_id
   limit 1;
$$;
grant execute on function public.resolve_redemption_by_code(text, uuid) to authenticated;

-- =====================================================================
-- fulfill_redemption: manager marks a pending redemption as completed
-- =====================================================================
create or replace function public.fulfill_redemption(p_redemption_id uuid)
returns table (redemption_id uuid, status text, fulfilled_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_business_id  uuid;
  v_status       text;
begin
  select r.business_id, r.status into v_business_id, v_status
    from public.redemptions r where r.id = p_redemption_id for update;

  if v_business_id is null then
    raise exception 'redemption not found';
  end if;

  if not public.staffs_business(v_business_id) then
    raise exception 'permission denied: not authorized to fulfill redemptions for this business';
  end if;

  if v_status = 'fulfilled' then
    raise exception 'this redemption was already fulfilled';
  end if;
  if v_status = 'cancelled' then
    raise exception 'this redemption was cancelled and cannot be fulfilled';
  end if;
  if v_status = 'expired' then
    raise exception 'this redemption has expired';
  end if;

  update public.redemptions
     set status = 'fulfilled',
         fulfilled_by = auth.uid(),
         fulfilled_at = now()
   where id = p_redemption_id;

  return query
    select p_redemption_id, 'fulfilled'::text, now();
end; $$;
grant execute on function public.fulfill_redemption(uuid) to authenticated;

-- =====================================================================
-- my_redemptions: customer-facing list of their active redemptions for a business
-- =====================================================================
create or replace function public.my_redemptions(p_business_id uuid)
returns table (
  id uuid, reward_id uuid, reward_name text, reward_type text,
  point_cost integer, code text, status text,
  created_at timestamptz, expires_at timestamptz, fulfilled_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select r.id, r.reward_id, rw.name, rw.reward_type,
         r.point_cost, r.code, r.status,
         r.created_at, r.expires_at, r.fulfilled_at
    from public.redemptions r
    join public.rewards rw on rw.id = r.reward_id
    join public.business_memberships m on m.id = r.membership_id
   where m.user_id = auth.uid()
     and r.business_id = p_business_id
   order by r.created_at desc;
$$;
grant execute on function public.my_redemptions(uuid) to authenticated;

-- Enable Realtime on redemptions so the manager's "fulfill" instantly
-- updates the customer's active-rewards list.
alter publication supabase_realtime add table public.redemptions;
alter table public.redemptions replica identity full;
