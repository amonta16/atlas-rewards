-- =====================================================================
-- CHECKPOINT 7 — Review reward flow
-- =====================================================================
-- The reviews table already exists from CP 1. We just need the RPCs that
-- handle customer submission and manager approval, plus point award.
-- =====================================================================

-- submit_review: customer submits a review claim (creates pending row)
create or replace function public.submit_review(
  p_business_id     uuid,
  p_review_link     text default null,
  p_screenshot_url  text default null
)
returns table (review_id uuid, status text)
language plpgsql security definer set search_path = public as $$
declare
  v_membership_id  uuid;
  v_review_id      uuid;
  v_method         text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  -- Look up the caller's membership at this business
  select id into v_membership_id
    from public.business_memberships
   where business_id = p_business_id and user_id = auth.uid();
  if v_membership_id is null then raise exception 'you are not a member of this business'; end if;

  -- Anti-abuse: max 1 pending review per member at a time
  if exists (
    select 1 from public.reviews r
     where r.membership_id = v_membership_id and r.status = 'pending'
  ) then
    raise exception 'you already have a pending review — wait for staff to verify it first';
  end if;

  -- Determine verification method
  v_method := case
    when p_screenshot_url is not null then 'screenshot'
    when p_review_link    is not null then 'link'
    else 'manual'
  end;

  insert into public.reviews
    (membership_id, business_id, platform, status, verification_method, verification_data)
  values
    (v_membership_id, p_business_id, 'google', 'pending', v_method,
     jsonb_build_object('review_link', p_review_link, 'screenshot_url', p_screenshot_url))
  returning id into v_review_id;

  return query select v_review_id, 'pending'::text;
end; $$;
grant execute on function public.submit_review(uuid, text, text) to authenticated;

-- =====================================================================
-- approve_review: manager approves a pending review, awards points
-- =====================================================================
create or replace function public.approve_review(p_review_id uuid)
returns table (review_id uuid, status text, points_awarded int)
language plpgsql security definer set search_path = public as $$
declare
  v_business_id  uuid;
  v_membership   uuid;
  v_status       text;
  v_pts          int;
  v_award        record;
begin
  select business_id, membership_id, status
    into v_business_id, v_membership, v_status
    from public.reviews where id = p_review_id for update;

  if v_business_id is null then raise exception 'review not found'; end if;
  if v_status <> 'pending' then raise exception 'review is %, not pending', v_status; end if;
  if not public.staffs_business(v_business_id) then raise exception 'permission denied'; end if;

  -- Look up the configured point value
  select coalesce((point_rules->>'review')::int, 0)
    into v_pts from public.businesses where id = v_business_id;
  if v_pts <= 0 then raise exception 'review rule is set to 0 points — edit it in the brand editor'; end if;

  -- Award via the engine
  select * into v_award from public.award_points(
    v_membership, v_pts, 'review', p_review_id,
    'review_' || p_review_id::text, 'Google review verified'
  );

  -- Mark verified
  update public.reviews
     set status = 'verified',
         verified_at = now(),
         verified_by = auth.uid(),
         reward_issued_at = now()
   where id = p_review_id;

  return query select p_review_id, 'verified'::text, v_pts;
end; $$;
grant execute on function public.approve_review(uuid) to authenticated;

-- =====================================================================
-- reject_review: manager rejects a review
-- =====================================================================
create or replace function public.reject_review(p_review_id uuid, p_reason text default null)
returns table (review_id uuid, status text)
language plpgsql security definer set search_path = public as $$
declare
  v_business_id uuid;
  v_status text;
begin
  select business_id, status into v_business_id, v_status
    from public.reviews where id = p_review_id for update;
  if v_business_id is null then raise exception 'review not found'; end if;
  if v_status <> 'pending' then raise exception 'review is %, not pending', v_status; end if;
  if not public.staffs_business(v_business_id) then raise exception 'permission denied'; end if;

  update public.reviews
     set status = 'rejected',
         verified_at = now(),
         verified_by = auth.uid(),
         verification_data = coalesce(verification_data, '{}'::jsonb) || jsonb_build_object('rejection_reason', p_reason)
   where id = p_review_id;

  return query select p_review_id, 'rejected'::text;
end; $$;
grant execute on function public.reject_review(uuid, text) to authenticated;

-- =====================================================================
-- my_review_status: customer's most recent review for a business
-- =====================================================================
create or replace function public.my_review_status(p_business_id uuid)
returns table (id uuid, status text, submitted_at timestamptz, verified_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.id, r.status, r.submitted_at, r.verified_at
    from public.reviews r
    join public.business_memberships m on m.id = r.membership_id
   where m.user_id = auth.uid() and r.business_id = p_business_id
   order by r.submitted_at desc
   limit 1;
$$;
grant execute on function public.my_review_status(uuid) to authenticated;

-- =====================================================================
-- pending_reviews_for_business: manager queue
-- =====================================================================
create or replace function public.pending_reviews_for_business(p_business_id uuid)
returns table (
  id uuid, member_name text, member_email text,
  verification_method text, verification_data jsonb, submitted_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select r.id,
         coalesce(p.full_name, split_part(p.email::text, '@', 1)) as member_name,
         p.email::text,
         r.verification_method, r.verification_data, r.submitted_at
    from public.reviews r
    join public.business_memberships m on m.id = r.membership_id
    join public.profiles p on p.id = m.user_id
   where r.business_id = p_business_id and r.status = 'pending'
   order by r.submitted_at asc;
$$;
grant execute on function public.pending_reviews_for_business(uuid) to authenticated;

-- =====================================================================
-- Realtime for reviews so the customer sees pending → verified live
-- =====================================================================
do $$
begin
  alter publication supabase_realtime add table public.reviews;
exception when duplicate_object then null;
end $$;
alter table public.reviews replica identity full;
