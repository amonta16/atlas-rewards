-- =====================================================================
-- CHECKPOINT 35 — Polish + bug fixes
-- =====================================================================
-- Andrew tested the live build and flagged:
--   1. Google review can be re-submitted after it was already verified
--      (one-and-done was supposed to be the rule).
--   2. NotificationCenter is too wide on desktop (UI-only, no SQL).
--   3. Pending notifications need higher contrast (UI-only, no SQL).
--   4. Rewards-tab "!" badge scroll target is the top instead of the
--      review row (UI-only, no SQL).
--   5. Front-desk needs a phone preview on the Offers tab (UI-only).
--
-- Only #1 needs SQL. Safe to re-run.
-- =====================================================================

-- =====================================================================
-- 1. submit_review — block re-submit when already verified
-- =====================================================================
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
  v_existing       record;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  select id into v_membership_id
    from public.business_memberships
   where business_id = p_business_id and user_id = auth.uid();
  if v_membership_id is null then
    raise exception 'you are not a member of this business';
  end if;

  -- CP-35 hotfix: one-and-done. A verified review locks the loop — no
  -- more submissions allowed for this member at this business. Pending
  -- is also blocked (we already had that check, kept the message).
  select r.id, r.status into v_existing
    from public.reviews r
   where r.membership_id = v_membership_id
     and r.status in ('pending', 'verified')
   order by case r.status when 'verified' then 0 when 'pending' then 1 end
   limit 1;

  if v_existing.id is not null then
    if v_existing.status = 'verified' then
      raise exception 'you already submitted a review for this business — thanks!';
    else
      raise exception 'you already have a pending review — wait for staff to verify it first';
    end if;
  end if;

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
-- CP-35 done. Apply after cp34.
-- =====================================================================
