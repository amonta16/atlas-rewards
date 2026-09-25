-- CP-153 · (1) reward delete that actually works, (2) house-promo facts for the top banner
-- Safe to re-run.

-- ── 1. Rewards: archive instead of failing when history exists ───────────────
-- redemptions.reward_id is ON DELETE RESTRICT, so any reward that was ever
-- redeemed (even by a test member) could not be deleted and the builder
-- swallowed the error. Now: no redemptions → hard delete; redemptions →
-- archive (hidden everywhere, history kept for analytics).
alter table public.rewards add column if not exists archived_at timestamptz;
create index if not exists rewards_business_live_idx on public.rewards (business_id) where archived_at is null;

drop function if exists public.delete_reward(uuid, uuid);
create or replace function public.delete_reward(p_id uuid, p_business_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare v_redemptions int;
begin
  if not public.staffs_business(p_business_id) then raise exception 'permission denied'; end if;
  if not exists (select 1 from public.rewards where id = p_id and business_id = p_business_id) then
    return 'missing';
  end if;
  -- Never leave a wheel wedge pointing at a reward that no longer exists.
  delete from public.mystery_reward_pool where reward_id = p_id and business_id = p_business_id;
  select count(*) into v_redemptions from public.redemptions where reward_id = p_id;
  if v_redemptions = 0 then
    delete from public.rewards where id = p_id and business_id = p_business_id;
    return 'deleted';
  end if;
  update public.rewards
     set is_active = false, show_in_store = false, archived_at = now(), updated_at = now()
   where id = p_id and business_id = p_business_id;
  return 'archived';
end $$;
revoke all on function public.delete_reward(uuid, uuid) from public, anon;
grant execute on function public.delete_reward(uuid, uuid) to authenticated;

-- ── 2. House-promo facts: one round-trip for the banner's fallback lines ─────
drop function if exists public.house_promo_facts(uuid);
create or replace function public.house_promo_facts(p_business_id uuid)
returns table (
  reward_count int,
  cheapest_reward_name text, cheapest_reward_cost int,
  top_reward_name text, top_reward_cost int,
  wheel_max_points int, wheel_has_prize boolean,
  booking_count int, booking_first_name text, booking_unit_label text,
  membership_enabled boolean, membership_name text, membership_price_cents int, membership_multiplier numeric,
  is_paid_member boolean
)
language sql stable security definer set search_path = public
as $$
  with r as (
    select name, point_cost from public.rewards
     where business_id = p_business_id and is_active and coalesce(show_in_store, true) and archived_at is null
  ),
  w as (
    select coalesce(max(points_amount) filter (where kind = 'points'), 0) as max_pts,
           bool_or(kind <> 'points') as has_prize
      from public.mystery_reward_pool where business_id = p_business_id and is_active
  ),
  b as (
    select count(*)::int as n,
           (array_agg(name order by sort_order, created_at))[1] as first_name,
           (array_agg(unit_label order by sort_order, created_at))[1] as unit_label
      from public.booking_resources where business_id = p_business_id and is_active
  ),
  m as (
    select is_enabled, membership_name, price_cents, points_multiplier
      from public.business_membership_billing where business_id = p_business_id
  ),
  me as (
    select coalesce(bool_or(membership_payment_status in ('active','paid','trialing','past_due')), false) as paid
      from public.business_memberships where business_id = p_business_id and user_id = auth.uid()
  )
  select (select count(*)::int from r),
         (select name from r order by point_cost asc, name limit 1),
         (select point_cost from r order by point_cost asc, name limit 1),
         (select name from r order by point_cost desc, name limit 1),
         (select point_cost from r order by point_cost desc, name limit 1),
         (select max_pts from w), (select coalesce(has_prize, false) from w),
         (select n from b), (select first_name from b), (select unit_label from b),
         (select coalesce(is_enabled, false) from m), (select membership_name from m),
         (select price_cents from m), (select points_multiplier from m),
         (select paid from me);
$$;
revoke all on function public.house_promo_facts(uuid) from public, anon;
grant execute on function public.house_promo_facts(uuid) to authenticated;
