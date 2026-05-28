-- =====================================================================
-- CP-32 HOTFIX — "column reference 'status' is ambiguous" in
-- approve_review + reject_review
-- =====================================================================
-- The RPCs returned a table with a column named `status` AND queried
-- the reviews table which also has a `status` column. Postgres flagged
-- the ambiguity at runtime. Fix: fully-qualify all column references
-- with the `r.` alias so it's unambiguous.
--
-- Safe to re-run. Apply after cp32_migration.sql.
-- =====================================================================

drop function if exists public.approve_review(uuid);
create function public.approve_review(p_review_id uuid)
returns table (review_id uuid, status text, points_awarded int)
language plpgsql security definer set search_path = public as $$
declare
  v_business_id  uuid;
  v_membership   uuid;
  v_status       text;
  v_pts          int;
begin
  -- CP-32-hotfix: qualified column references (r.status, r.business_id,
  -- r.membership_id) so Postgres doesn't conflate them with the return-
  -- table columns of the same name.
  select r.business_id, r.membership_id, r.status
    into v_business_id, v_membership, v_status
    from public.reviews r
   where r.id = p_review_id
   for update;

  if v_business_id is null then raise exception 'review not found'; end if;
  if v_status <> 'pending' then raise exception 'review is %, not pending', v_status; end if;
  if not public.staffs_business(v_business_id) then
    raise exception 'permission denied — your account is not on this business''s team. Ask the manager to invite you.';
  end if;

  -- Fall back to 5 pts if the review rule was never set, so the
  -- front-desk button never silently breaks for a brand-new business.
  select coalesce(nullif((b.point_rules->>'review')::int, 0), 5)
    into v_pts from public.businesses b where b.id = v_business_id;

  perform public.award_points(
    v_membership, v_pts, 'review', p_review_id,
    'review_' || p_review_id::text, 'Google review verified'
  );

  update public.reviews r
     set status            = 'verified',
         verified_at       = now(),
         verified_by       = auth.uid(),
         reward_issued_at  = now()
   where r.id = p_review_id;

  return query select p_review_id, 'verified'::text, v_pts;
end; $$;
grant execute on function public.approve_review(uuid) to authenticated;


drop function if exists public.reject_review(uuid, text);
create function public.reject_review(p_review_id uuid, p_reason text default null)
returns table (review_id uuid, status text)
language plpgsql security definer set search_path = public as $$
declare
  v_business_id uuid;
  v_status      text;
begin
  select r.business_id, r.status
    into v_business_id, v_status
    from public.reviews r
   where r.id = p_review_id
   for update;
  if v_business_id is null then raise exception 'review not found'; end if;
  if v_status <> 'pending' then raise exception 'review is %, not pending', v_status; end if;
  if not public.staffs_business(v_business_id) then
    raise exception 'permission denied — your account is not on this business''s team.';
  end if;

  update public.reviews r
     set status            = 'rejected',
         verified_at       = now(),
         verified_by       = auth.uid(),
         verification_data = coalesce(r.verification_data, '{}'::jsonb)
                             || jsonb_build_object('rejection_reason', p_reason)
   where r.id = p_review_id;

  return query select p_review_id, 'rejected'::text;
end; $$;
grant execute on function public.reject_review(uuid, text) to authenticated;

-- Done. Paste this whole file into the Supabase SQL editor.
