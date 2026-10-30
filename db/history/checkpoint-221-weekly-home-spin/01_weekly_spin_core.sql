-- CP-221 · part 1 — weekly home spin (entertainment apps)
--
-- Every member gets ONE free spin of the prize wheel per week that they can
-- take from home (no check-in). It does not stack: skip a week and you still
-- have exactly one. The check-in spin is unchanged and separate.
--
--   · week = Monday 00:00 → Sunday 23:59 in the business's timezone;
--   · businesses.weekly_spin_enabled turns it on (default on for
--     layout_preset 'entertainment', set automatically when a business
--     becomes entertainment; off when it leaves);
--   · mystery_reward_spins.source = 'checkin' | 'home' tells them apart;
--   · spin_daily_reward uses the check-in spin first (if they're checked in
--     today and haven't used it), otherwise the weekly home spin.

alter table public.businesses add column if not exists weekly_spin_enabled boolean not null default false;
alter table public.mystery_reward_spins add column if not exists source text not null default 'checkin';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'mystery_reward_spins_source_chk') then
    alter table public.mystery_reward_spins add constraint mystery_reward_spins_source_chk check (source in ('checkin','home'));
  end if;
end $$;
create index if not exists mystery_reward_spins_home_idx
  on public.mystery_reward_spins (membership_id, awarded_at) where source = 'home';
create index if not exists mystery_reward_spins_biz_time_idx
  on public.mystery_reward_spins (business_id, awarded_at);

create or replace function public._weekly_spin_default()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.layout_preset = 'entertainment' then new.weekly_spin_enabled := true; end if;
  elsif old.layout_preset is distinct from new.layout_preset then
    new.weekly_spin_enabled := (new.layout_preset = 'entertainment');
  end if;
  return new;
end $$;
drop trigger if exists trg_weekly_spin_default on public.businesses;
create trigger trg_weekly_spin_default before insert or update of layout_preset on public.businesses
  for each row execute function public._weekly_spin_default();

-- Monday 00:00 local of the week containing p_at.
create or replace function public.weekly_spin_week_start(p_business_id uuid, p_at timestamptz default now())
returns timestamptz language sql stable security definer set search_path to 'public' as $$
  select date_trunc('week', p_at at time zone t.tz) at time zone t.tz
    from (select coalesce(public.business_timezone(p_business_id), 'America/Los_Angeles') as tz) t
$$;

-- One answer for every surface (home card, wheel modal, desk).
create or replace function public._spin_status(p_business_id uuid, p_membership_id uuid)
returns table(checked_in_today boolean, checkin_available boolean, home_enabled boolean,
              home_available boolean, home_spun_at timestamptz, home_resets_at timestamptz)
language plpgsql stable security definer set search_path to 'public' as $$
declare v_ws timestamptz; v_en boolean; v_demo boolean;
begin
  select coalesce(b.weekly_spin_enabled, false), coalesce(b.is_demo, false) into v_en, v_demo
    from public.businesses b where b.id = p_business_id;
  v_ws := public.weekly_spin_week_start(p_business_id);
  checked_in_today := exists (select 1 from public.check_in_events ce
                               where ce.membership_id = p_membership_id and ce.created_at >= date_trunc('day', now()));
  checkin_available := v_demo or (checked_in_today and not exists (
      select 1 from public.mystery_reward_spins s where s.membership_id = p_membership_id
         and s.source = 'checkin' and s.awarded_at >= date_trunc('day', now())));
  home_enabled := v_en;
  select max(s.awarded_at) into home_spun_at from public.mystery_reward_spins s
   where s.membership_id = p_membership_id and s.source = 'home' and s.awarded_at >= v_ws;
  home_available := v_en and home_spun_at is null;
  home_resets_at := v_ws + interval '7 days';
  return next;
end $$;
revoke execute on function public._spin_status(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.weekly_spin_week_start(uuid, timestamptz) from public, anon;

-- Customer app.
create or replace function public.my_spin_status(p_business_id uuid, p_membership_id uuid)
returns table(checked_in_today boolean, checkin_available boolean, home_enabled boolean,
              home_available boolean, home_spun_at timestamptz, home_resets_at timestamptz)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not exists (select 1 from public.business_memberships m
                  where m.id = p_membership_id and m.business_id = p_business_id
                    and (m.user_id = auth.uid() or public.staffs_business(p_business_id))) then
    return;
  end if;
  return query select * from public._spin_status(p_business_id, p_membership_id);
end $$;
revoke execute on function public.my_spin_status(uuid, uuid) from public, anon;
grant execute on function public.my_spin_status(uuid, uuid) to authenticated;

-- The check-in spin's cooldown only counts check-in spins now (a home spin
-- in the morning must not hide the visit spin in the afternoon).
CREATE OR REPLACE FUNCTION public.mystery_reward_status(p_business_id uuid, p_membership_id uuid)
 RETURNS TABLE(is_available boolean, next_spin_at timestamp with time zone)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_last timestamptz; v_demo boolean;
begin
  select coalesce(is_demo, false) into v_demo from public.businesses where id = p_business_id;
  if v_demo then is_available := true; next_spin_at := null; return next; return; end if;
  -- CP-73: one check-in spin per day. CP-221: home spins don't count here.
  select max(awarded_at) into v_last from public.mystery_reward_spins
   where membership_id = p_membership_id and source = 'checkin';
  if v_last is null or v_last < date_trunc('day', now()) then
    is_available := true; next_spin_at := null;
  else
    is_available := false; next_spin_at := date_trunc('day', now()) + interval '1 day';
  end if;
  return next;
end; $function$;

CREATE OR REPLACE FUNCTION public.spin_daily_reward(p_business_id uuid, p_membership_id uuid)
 RETURNS TABLE(prize_id uuid, prize_name text, prize_description text, prize_image_url text, kind text, points_amount integer, coupon_code text, new_balance integer, prize_expires_at timestamp with time zone)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_owner uuid; v_checked_in boolean; v_last timestamptz; v_total_w int; v_pick int; v_cum int := 0;
  v_pool record; v_new_bal int; v_demo boolean; v_prize_id uuid; v_name text; v_desc text; v_img text;
  v_kind text; v_points int; v_coupon text := null; v_reward_id uuid; v_r float; v_exp_days int := null;
  v_expires timestamptz := null; v_source text := 'checkin'; v_home_on boolean;
begin
  select bm.user_id into v_owner from public.business_memberships bm
   where bm.id = p_membership_id and bm.business_id = p_business_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not your membership' using errcode = '42501';
  end if;

  select coalesce(b.is_demo, false), coalesce(b.weekly_spin_enabled, false) into v_demo, v_home_on
    from public.businesses b where b.id = p_business_id;

  if not v_demo then
    perform 1 from public.business_memberships bm where bm.id = p_membership_id for update;
    select exists (select 1 from public.check_in_events ce
                    where ce.membership_id = p_membership_id and ce.created_at >= date_trunc('day', now()))
      into v_checked_in;
    select max(mrs.awarded_at) into v_last from public.mystery_reward_spins mrs
     where mrs.membership_id = p_membership_id and mrs.source = 'checkin';

    if v_checked_in and (v_last is null or v_last < date_trunc('day', now())) then
      v_source := 'checkin';                                   -- today's visit spin first
    elsif v_home_on and not exists (
            select 1 from public.mystery_reward_spins mrs
             where mrs.membership_id = p_membership_id and mrs.source = 'home'
               and mrs.awarded_at >= public.weekly_spin_week_start(p_business_id)) then
      v_source := 'home';                                      -- CP-221: weekly home spin
    elsif not v_checked_in then
      raise exception 'check in first to unlock your spin';
    else
      raise exception 'already spun — come back after the cooldown';
    end if;
  end if;

  select coalesce(sum(mrp.weight), 0) into v_total_w from public.mystery_reward_pool mrp
   where mrp.business_id = p_business_id and mrp.is_active and mrp.kind <> 'coupon';

  if v_total_w = 0 then
    v_r := random();
    if v_r < 0.05 then v_points := 300; v_name := 'Jackpot — 300 points';
    elsif v_r < 0.20 then v_points := 100; v_name := 'Lucky — 100 points';
    else v_points := 50; v_name := 'Nice spin — 50 points'; end if;
    v_kind := 'points'; v_prize_id := null; v_desc := null; v_img := null; v_reward_id := null;
  else
    v_pick := floor(random() * v_total_w) + 1;
    for v_pool in
      select * from public.mystery_reward_pool mrp
       where mrp.business_id = p_business_id and mrp.is_active and mrp.kind <> 'coupon'
       order by mrp.created_at
    loop
      v_cum := v_cum + v_pool.weight;
      exit when v_cum >= v_pick;
    end loop;
    v_prize_id := v_pool.id; v_name := v_pool.prize_name; v_desc := v_pool.prize_description;
    v_img := v_pool.prize_image_url; v_kind := v_pool.kind; v_points := v_pool.points_amount;
    v_reward_id := v_pool.reward_id; v_exp_days := v_pool.expires_days;
    if v_kind = 'reward' and v_img is null and v_reward_id is not null then
      select r.image_url into v_img from public.rewards r where r.id = v_reward_id;
    end if;
  end if;

  insert into public.mystery_reward_spins (business_id, membership_id, prize_id, source)
  values (p_business_id, p_membership_id, v_prize_id, v_source);

  if v_kind = 'points' and coalesce(v_points, 0) > 0 then
    update public.business_memberships bm
       set points_balance = bm.points_balance + v_points,
           lifetime_points_earned = bm.lifetime_points_earned + v_points,
           updated_at = now()
     where bm.id = p_membership_id
     returning bm.points_balance into v_new_bal;
    insert into public.points_ledger (membership_id, business_id, delta, rule_type, notes, balance_after, created_by)
    values (p_membership_id, p_business_id, v_points, 'mystery_bonus',
            case v_source when 'home' then 'Weekly home spin: ' else 'Daily spin: ' end || v_name, v_new_bal, auth.uid());
    perform public.recalc_tier(p_membership_id);
  elsif v_kind = 'reward' and v_reward_id is not null then
    v_expires := public.prize_expires_at(p_business_id, v_exp_days);
    insert into public.redemptions (membership_id, reward_id, business_id, point_cost, code, status, expires_at)
    values (p_membership_id, v_reward_id, p_business_id, 0, public.generate_redemption_code(p_business_id), 'pending', v_expires);
    select bm.points_balance into v_new_bal from public.business_memberships bm where bm.id = p_membership_id;
  else
    select bm.points_balance into v_new_bal from public.business_memberships bm where bm.id = p_membership_id;
  end if;

  return query select v_prize_id, v_name, v_desc, v_img, v_kind, v_points, v_coupon, v_new_bal, v_expires;
end;
$function$;

-- Admin switch (Settings → Notifications card in the brand editor).
create or replace function public.set_weekly_spin_enabled(p_business_id uuid, p_enabled boolean)
returns boolean language plpgsql security definer set search_path to 'public' as $$
begin
  if public.current_app_role(p_business_id) not in ('agency_admin', 'business_manager') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  update public.businesses set weekly_spin_enabled = p_enabled where id = p_business_id;
  return p_enabled;
end $$;
revoke execute on function public.set_weekly_spin_enabled(uuid, boolean) from public, anon;
grant execute on function public.set_weekly_spin_enabled(uuid, boolean) to authenticated;
