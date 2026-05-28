-- =====================================================================
-- CHECKPOINT 6 — Referral tracking RPCs
-- Customer's existing referral_code (6-char member code) doubles as their
-- referral code. No new columns. No new tables (referrals table from CP 1).
-- =====================================================================

-- process_referral: called from the signup flow once a new user
-- has been enrolled and has a membership. Awards points to BOTH parties
-- (per business point_rules) and creates the referrals row.
create or replace function public.process_referral(
  p_referrer_code  text,
  p_business_id    uuid
)
returns table (referral_id uuid, referrer_points int, referee_points int)
language plpgsql security definer set search_path = public as $$
declare
  v_referrer_mem  uuid;
  v_referee_mem   uuid;
  v_referee_uid   uuid := auth.uid();
  v_referral_id   uuid;
  v_pts_referrer  int;
  v_pts_referee   int;
begin
  if v_referee_uid is null then
    raise exception 'not authenticated';
  end if;

  -- Find the referrer's membership at this business by code
  select id into v_referrer_mem
    from public.business_memberships
   where referral_code = upper(p_referrer_code)
     and business_id = p_business_id;
  if v_referrer_mem is null then
    raise exception 'referral code "%s" not found at this business', p_referrer_code;
  end if;

  -- Find the new user's (referee's) membership
  select id into v_referee_mem
    from public.business_memberships
   where user_id = v_referee_uid and business_id = p_business_id;
  if v_referee_mem is null then
    raise exception 'you are not enrolled yet — try again in a moment';
  end if;

  -- Anti-fraud: no self-referrals
  if v_referrer_mem = v_referee_mem then
    raise exception 'cannot use your own referral code';
  end if;

  -- Don't process the same referee twice (would double-award)
  if exists (
    select 1 from public.referrals
     where referee_membership_id = v_referee_mem
       and business_id = p_business_id
  ) then
    raise exception 'this account was already referred';
  end if;

  -- Read business point_rules
  select coalesce((point_rules->>'referral_referrer')::int, 0),
         coalesce((point_rules->>'referral_referee')::int, 0)
    into v_pts_referrer, v_pts_referee
    from public.businesses where id = p_business_id;

  -- Create the referral row in completed state (MVP auto-completes on signup)
  insert into public.referrals
    (business_id, referrer_membership_id, referee_user_id, referee_membership_id,
     code, status, signed_up_at, completed_at, reward_issued_at)
  values
    (p_business_id, v_referrer_mem, v_referee_uid, v_referee_mem,
     upper(p_referrer_code), 'completed', now(), now(), now())
  returning id into v_referral_id;

  -- Award the referrer
  if v_pts_referrer > 0 then
    perform public.award_points(
      v_referrer_mem, v_pts_referrer, 'referral_referrer',
      v_referral_id, 'ref_r_' || v_referral_id::text, 'Referred a new member'
    );
  end if;

  -- Award the referee
  if v_pts_referee > 0 then
    perform public.award_points(
      v_referee_mem, v_pts_referee, 'referral_referee',
      v_referral_id, 'ref_e_' || v_referral_id::text, 'Welcome (referral bonus)'
    );
  end if;

  return query select v_referral_id, v_pts_referrer, v_pts_referee;
end; $$;
grant execute on function public.process_referral(text, uuid) to authenticated;

-- =====================================================================
-- my_referrals: customer-facing — list of referrals I made
-- =====================================================================
create or replace function public.my_referrals(p_business_id uuid)
returns table (
  id uuid, code text, status text,
  referee_name text, referee_email text,
  created_at timestamptz, completed_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select r.id, r.code, r.status,
         coalesce(p.full_name, split_part(p.email::text, '@', 1)) as referee_name,
         p.email::text,
         r.created_at, r.completed_at
    from public.referrals r
    join public.business_memberships m on m.id = r.referrer_membership_id
    left join public.profiles p on p.id = r.referee_user_id
   where m.user_id = auth.uid()
     and r.business_id = p_business_id
   order by r.created_at desc;
$$;
grant execute on function public.my_referrals(uuid) to authenticated;

-- =====================================================================
-- Realtime: referrer's app gets live update when a new referee signs up
-- (idempotent — won't fail if already added)
-- =====================================================================
do $$
begin
  alter publication supabase_realtime add table public.referrals;
exception when duplicate_object then null;
end $$;
alter table public.referrals replica identity full;
