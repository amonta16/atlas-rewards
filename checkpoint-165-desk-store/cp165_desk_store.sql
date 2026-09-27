-- CP-165 · front desk can redeem rewards FOR a member (no phone needed). Safe to re-run.

-- What this member can claim right now: store rewards with an affordable flag,
-- plus any pending free redemptions (wheel prizes, win-back gifts) waiting to be handed over.
drop function if exists public.desk_member_store(uuid);
create or replace function public.desk_member_store(p_membership_id uuid)
returns table (
  kind text,                 -- 'reward' | 'pending'
  id uuid,                   -- reward id, or redemption id for pending
  name text, category text, description text, image_url text,
  point_cost int, affordable boolean, expires_at timestamptz, code text
)
language sql stable security definer set search_path = public as $$
  with m as (
    select bm.id, bm.business_id, bm.points_balance
      from public.business_memberships bm where bm.id = p_membership_id
  )
  select * from (
  select 'pending'::text as kind, d.id, coalesce(r.name, 'Reward') as name, r.category, r.description, r.image_url,
         0 as point_cost, true as affordable, d.expires_at, d.code
    from public.redemptions d join m on m.id = d.membership_id
    left join public.rewards r on r.id = d.reward_id
   where d.status = 'pending' and (d.expires_at is null or d.expires_at > now())
     and public.staffs_business(m.business_id)
  union all
  select 'reward'::text, r.id, r.name, r.category, r.description, r.image_url,
         r.point_cost, (m.points_balance >= r.point_cost), null::timestamptz, null::text
    from public.rewards r join m on m.business_id = r.business_id
   where r.is_active and coalesce(r.show_in_store, true) and r.archived_at is null
     and public.staffs_business(m.business_id)
  ) x
   order by (x.kind = 'pending') desc, x.affordable desc, x.point_cost asc;
$$;
revoke all on function public.desk_member_store(uuid) from public, anon;
grant execute on function public.desk_member_store(uuid) to authenticated;

-- Redeem + hand over in one step: deduct points, write the redemption as fulfilled.
drop function if exists public.desk_redeem_reward(uuid, uuid);
create or replace function public.desk_redeem_reward(p_membership_id uuid, p_reward_id uuid)
returns table (redemption_id uuid, new_balance int)
language plpgsql security definer set search_path = public as $$
declare
  v_biz uuid; v_cost int; v_name text; v_bal int; v_red uuid; v_award record;
begin
  select bm.business_id, bm.points_balance into v_biz, v_bal
    from public.business_memberships bm where bm.id = p_membership_id for update;
  if v_biz is null then raise exception 'member not found'; end if;
  if not public.staffs_business(v_biz) then raise exception 'permission denied'; end if;

  select r.point_cost, r.name into v_cost, v_name
    from public.rewards r
   where r.id = p_reward_id and r.business_id = v_biz and r.is_active and r.archived_at is null;
  if v_cost is null then raise exception 'reward not available'; end if;
  if v_bal < v_cost then raise exception 'not enough points (need %, have %)', v_cost, v_bal; end if;

  insert into public.redemptions (membership_id, reward_id, business_id, point_cost, code, status, fulfilled_by, fulfilled_at)
  values (p_membership_id, p_reward_id, v_biz, v_cost, public.generate_redemption_code(v_biz), 'fulfilled', auth.uid(), now())
  returning id into v_red;

  select * into v_award from public.award_points(
    p_membership_id, -v_cost, 'redemption', v_red, 'redeem_' || v_red, 'Redeemed at the desk: ' || v_name);

  return query select v_red, v_award.new_balance;
end $$;
revoke all on function public.desk_redeem_reward(uuid, uuid) from public, anon;
grant execute on function public.desk_redeem_reward(uuid, uuid) to authenticated;

-- Who is signed in at the desk (name for the sidebar).
drop function if exists public.my_display_name();
create or replace function public.my_display_name()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(trim(p.full_name), ''), split_part(u.email, '@', 1))
    from auth.users u left join public.profiles p on p.id = u.id
   where u.id = auth.uid();
$$;
revoke all on function public.my_display_name() from public, anon;
grant execute on function public.my_display_name() to authenticated;
