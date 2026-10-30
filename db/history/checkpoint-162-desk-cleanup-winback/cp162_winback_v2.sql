-- CP-162 · "We miss you" can carry a REWARD (not just points), it expires,
-- and it notifies through the gated pipeline. Safe to re-run.
drop function if exists public.send_winback_v2(uuid, uuid, text, text, int, uuid, int);
create or replace function public.send_winback_v2(
  p_business_id uuid, p_membership_id uuid, p_title text, p_body text,
  p_bonus_points int default null, p_reward_id uuid default null, p_expires_days int default 7
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; v_user uuid; v_exp timestamptz; v_reward_name text; v_biz text; v_code text; v_bal int;
begin
  if not public.staffs_business(p_business_id) then raise exception 'permission denied'; end if;
  select m.user_id into v_user from public.business_memberships m where m.id = p_membership_id and m.business_id = p_business_id;
  if v_user is null then raise exception 'membership not found'; end if;
  select name into v_biz from public.businesses where id = p_business_id;
  v_exp := now() + (greatest(1, coalesce(p_expires_days, 7)) || ' days')::interval;

  -- in-app message card (Home), same as v1 but with the real expiry
  insert into public.customer_messages (business_id, membership_id, kind, title, body, bonus_points, expires_at)
  values (p_business_id, p_membership_id, 'winback', coalesce(p_title, 'We miss you ✨'),
          coalesce(p_body, 'Come back soon — something is waiting for you.'), p_bonus_points, v_exp)
  returning id into v_id;

  if p_reward_id is not null then
    select name into v_reward_name from public.rewards where id = p_reward_id and business_id = p_business_id and archived_at is null;
    if v_reward_name is null then raise exception 'reward not found'; end if;
    -- A free redemption with a hard expiry — the same shape a wheel prize
    -- uses, so the desk redeems it the same way and CP-161's expiry
    -- reminders (48h / last call) cover it automatically.
    v_code := public.generate_redemption_code(p_business_id);
    insert into public.redemptions (membership_id, reward_id, business_id, point_cost, code, status, expires_at)
    values (p_membership_id, p_reward_id, p_business_id, 0, v_code, 'pending', v_exp);
  end if;

  if coalesce(p_bonus_points, 0) > 0 then
    update public.business_memberships
       set points_balance = points_balance + p_bonus_points,
           lifetime_points_earned = lifetime_points_earned + p_bonus_points, updated_at = now()
     where id = p_membership_id returning points_balance into v_bal;
    insert into public.points_ledger (business_id, membership_id, delta, rule_type, notes, balance_after, created_by)
    values (p_business_id, p_membership_id, p_bonus_points, 'winback_bonus', 'Win-back bonus', v_bal, auth.uid());
  end if;

  -- one notification, through the gate (kind we_miss_you → business toggle honored)
  insert into public.notifications (user_id, business_id, kind, title, body, link_path)
  values (v_user, p_business_id, 'we_miss_you',
          coalesce(p_title, 'We miss you ✨'),
          case
            when p_reward_id is not null and coalesce(p_bonus_points,0) > 0
              then v_reward_name || ' + ' || p_bonus_points || ' pts are yours — expires ' || to_char(v_exp at time zone public.business_timezone(p_business_id), 'Mon DD') || '.'
            when p_reward_id is not null
              then v_reward_name || ' is waiting for you, free — expires ' || to_char(v_exp at time zone public.business_timezone(p_business_id), 'Mon DD') || '.'
            when coalesce(p_bonus_points,0) > 0
              then '+' || p_bonus_points || ' pts added. ' || coalesce(p_body, '')
            else coalesce(p_body, 'Come back soon.')
          end,
          '/app/rewards');
  return v_id;
end $$;
revoke all on function public.send_winback_v2(uuid, uuid, text, text, int, uuid, int) from public, anon;
grant execute on function public.send_winback_v2(uuid, uuid, text, text, int, uuid, int) to authenticated;
