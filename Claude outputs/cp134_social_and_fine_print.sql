-- ============================================================================
-- CP-134 · Instagram / Facebook follow rewards + fine print on every reward
-- ----------------------------------------------------------------------------
-- Run in the Supabase SQL editor BEFORE deploying the CP-134 app build.
-- Self-contained: safe to re-run. Apply after cp133.
--
-- 1. SOCIAL FOLLOW REWARDS reuse the Google-review machinery (Flippos asked
--    for "the same thing for Instagram and Facebook"). reviews.platform has
--    existed since CP-01 ('google' only in practice); social follows are
--    reviews rows with platform 'instagram' / 'facebook'. Same pending →
--    staff-verified → points flow, same queue, same realtime channel.
--    Per-platform config lives in businesses.social_config (jsonb):
--      { "instagram": { "enabled": true, "url": "...", "handle": "@flippos",
--                       "points": 100, "title": "...", "description": "...",
--                       "rules": "...", "fine_print": "..." },
--        "facebook":  { ... } }
--
-- 2. FINE PRINT. rewards.terms (CP-01, never surfaced) is the per-reward
--    fine print. businesses.reward_fine_print is the vendor's business-wide
--    default, applied to any reward whose own terms are blank. The platform
--    disclaimer (ours) lives in agency_settings so it can be reviewed and
--    finalised before launch instead of hard-coded — read by the customer
--    app through platform_reward_terms().
-- ============================================================================

-- ── 1. Columns ───────────────────────────────────────────────────────────
alter table public.businesses
  add column if not exists social_config jsonb not null default '{}'::jsonb;
alter table public.businesses
  add column if not exists reward_fine_print text;
comment on column public.businesses.social_config is
  'CP-134 per-platform follow-reward config: {instagram:{enabled,url,handle,points,title,description,rules,fine_print}, facebook:{...}}';
comment on column public.businesses.reward_fine_print is
  'CP-134 vendor-wide default fine print shown on any reward without its own terms.';

alter table public.agency_settings
  add column if not exists reward_disclaimer text;
alter table public.agency_settings
  add column if not exists vendor_terms_hint text;

-- Seed the platform copy once (editable in Agency → Settings afterwards).
update public.agency_settings
   set reward_disclaimer = coalesce(reward_disclaimer,
        'Rewards and offers are created, honored, and managed by the business that offers them. '
        || 'Atlas Engine provides the software only and is not responsible for the availability, value, '
        || 'or fulfillment of any reward, and cannot be held liable for a reward that is refused, changed, or withdrawn. '
        || 'Rewards have no cash value unless the business states otherwise. '
        || 'See the business for complete reward details, restrictions, and eligibility requirements.'),
       vendor_terms_hint = coalesce(vendor_terms_hint,
        'See the vendor for complete reward details, restrictions, and eligibility requirements.')
 where id = 1;

-- Sensible default for every business that has none yet, and for new ones.
alter table public.businesses
  alter column reward_fine_print set default
    'One per customer per visit unless stated otherwise. Cannot be combined with other offers. '
    'Subject to availability. Management reserves the right to modify or end a reward at any time. '
    'See staff for complete details, restrictions, and eligibility.';
update public.businesses
   set reward_fine_print = 'One per customer per visit unless stated otherwise. Cannot be combined with other offers. '
                        || 'Subject to availability. Management reserves the right to modify or end a reward at any time. '
                        || 'See staff for complete details, restrictions, and eligibility.'
 where reward_fine_print is null;

-- Public read of the platform copy (one row, nothing sensitive).
create or replace function public.platform_reward_terms()
returns table (reward_disclaimer text, vendor_terms_hint text)
language sql stable security definer set search_path = public as $$
  select reward_disclaimer, vendor_terms_hint from public.agency_settings where id = 1;
$$;
grant execute on function public.platform_reward_terms() to anon, authenticated;

-- ── 2. Reviews RPCs become platform-aware ────────────────────────────────
-- The CP-35 one-and-done check ignored platform: a verified Google review
-- would block an Instagram follow. Scope everything by platform.

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
  if v_membership_id is null then raise exception 'you are not a member of this business'; end if;

  select r.id, r.status into v_existing
    from public.reviews r
   where r.membership_id = v_membership_id
     and r.platform = 'google'                                  -- CP-134
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
    else 'manual' end;

  insert into public.reviews
    (membership_id, business_id, platform, status, verification_method, verification_data)
  values
    (v_membership_id, p_business_id, 'google', 'pending', v_method,
     jsonb_build_object('review_link', p_review_link, 'screenshot_url', p_screenshot_url))
  returning id into v_review_id;
  return query select v_review_id, 'pending'::text;
end; $$;
grant execute on function public.submit_review(uuid, text, text) to authenticated;

-- Customer: "I followed you on Instagram / Facebook".
drop function if exists public.submit_social_follow(uuid, text, text);
create function public.submit_social_follow(
  p_business_id uuid,
  p_platform    text,
  p_handle      text default null
)
returns table (review_id uuid, status text)
language plpgsql security definer set search_path = public as $$
declare
  v_membership_id uuid;
  v_review_id     uuid;
  v_existing      record;
  v_cfg           jsonb;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_platform not in ('instagram', 'facebook') then raise exception 'unsupported platform'; end if;

  select social_config -> p_platform into v_cfg from public.businesses where id = p_business_id;
  if coalesce((v_cfg ->> 'enabled')::boolean, false) = false then
    raise exception 'this reward is not available right now';
  end if;

  select id into v_membership_id
    from public.business_memberships
   where business_id = p_business_id and user_id = auth.uid();
  if v_membership_id is null then raise exception 'you are not a member of this business'; end if;

  select r.id, r.status into v_existing
    from public.reviews r
   where r.membership_id = v_membership_id
     and r.platform = p_platform
     and r.status in ('pending', 'verified')
   order by case r.status when 'verified' then 0 when 'pending' then 1 end
   limit 1;
  if v_existing.id is not null then
    if v_existing.status = 'verified' then
      raise exception 'you already earned this reward — thanks for following!';
    else
      raise exception 'your follow is already pending — staff will verify it soon';
    end if;
  end if;

  insert into public.reviews
    (membership_id, business_id, platform, status, verification_method, verification_data)
  values
    (v_membership_id, p_business_id, p_platform, 'pending',
     case when nullif(btrim(p_handle), '') is not null then 'link' else 'manual' end,
     jsonb_build_object('handle', nullif(btrim(p_handle), '')))
  returning id into v_review_id;
  return query select v_review_id, 'pending'::text;
end; $$;
grant execute on function public.submit_social_follow(uuid, text, text) to authenticated;

-- Customer: Google status only (unchanged shape, now platform-scoped).
create or replace function public.my_review_status(p_business_id uuid)
returns table (id uuid, status text, submitted_at timestamptz, verified_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.id, r.status, r.submitted_at, r.verified_at
    from public.reviews r
    join public.business_memberships m on m.id = r.membership_id
   where m.user_id = auth.uid() and r.business_id = p_business_id
     and r.platform = 'google'
   order by r.submitted_at desc
   limit 1;
$$;
grant execute on function public.my_review_status(uuid) to authenticated;

-- Customer: one row per social platform they've touched.
drop function if exists public.my_social_status(uuid);
create function public.my_social_status(p_business_id uuid)
returns table (platform text, status text, submitted_at timestamptz, verified_at timestamptz)
language sql stable security definer set search_path = public as $$
  select distinct on (r.platform) r.platform, r.status, r.submitted_at, r.verified_at
    from public.reviews r
    join public.business_memberships m on m.id = r.membership_id
   where m.user_id = auth.uid() and r.business_id = p_business_id
     and r.platform in ('instagram', 'facebook')
   order by r.platform, r.submitted_at desc;
$$;
grant execute on function public.my_social_status(uuid) to authenticated;

-- Staff queue: now says which platform each row is for.
drop function if exists public.pending_reviews_for_business(uuid);
create function public.pending_reviews_for_business(p_business_id uuid)
returns table (
  id uuid, member_name text, member_email text,
  verification_method text, verification_data jsonb, submitted_at timestamptz,
  platform text
)
language sql stable security definer set search_path = public as $$
  select r.id,
         coalesce(p.full_name, split_part(p.email::text, '@', 1)) as member_name,
         p.email::text,
         r.verification_method, r.verification_data, r.submitted_at,
         r.platform
    from public.reviews r
    join public.business_memberships m on m.id = r.membership_id
    join public.profiles p on p.id = m.user_id
   where r.business_id = p_business_id and r.status = 'pending'
     and public.staffs_business(p_business_id)
   order by r.submitted_at asc;
$$;
grant execute on function public.pending_reviews_for_business(uuid) to authenticated;

-- Approve: points + ledger note depend on platform. Column references are
-- qualified (CP-32 hotfix): `status` / `review_id` are also OUT columns.
drop function if exists public.approve_review(uuid);
create function public.approve_review(p_review_id uuid)
returns table (review_id uuid, status text, points_awarded int)
language plpgsql security definer set search_path = public as $$
declare
  v_business_id  uuid;
  v_membership   uuid;
  v_status       text;
  v_platform     text;
  v_pts          int;
  v_rule         text;
  v_note         text;
begin
  select r.business_id, r.membership_id, r.status, r.platform
    into v_business_id, v_membership, v_status, v_platform
    from public.reviews r
   where r.id = p_review_id
   for update;
  if v_business_id is null then raise exception 'review not found'; end if;
  if v_status <> 'pending' then raise exception 'review is %, not pending', v_status; end if;
  if not public.staffs_business(v_business_id) then
    raise exception 'permission denied — your account is not on this business''s team. Ask the manager to invite you.';
  end if;

  if v_platform in ('instagram', 'facebook') then
    -- Per-platform points, else the generic social_follow rule, else 25.
    select coalesce(
             nullif((b.social_config -> v_platform ->> 'points')::int, 0),
             nullif((b.point_rules ->> 'social_follow')::int, 0),
             25)
      into v_pts from public.businesses b where b.id = v_business_id;
    v_rule := 'social_follow';
    v_note := initcap(v_platform) || ' follow verified';
  else
    select coalesce(nullif((b.point_rules->>'review')::int, 0), 5)
      into v_pts from public.businesses b where b.id = v_business_id;
    v_rule := 'review';
    v_note := 'Google review verified';
  end if;

  perform public.award_points(
    v_membership, v_pts, v_rule, p_review_id,
    'review_' || p_review_id::text, v_note
  );

  update public.reviews r
     set status = 'verified', verified_at = now(), verified_by = auth.uid(), reward_issued_at = now()
   where r.id = p_review_id;

  return query select p_review_id, 'verified'::text, v_pts;
end; $$;
grant execute on function public.approve_review(uuid) to authenticated;

-- ── verify ──────────────────────────────────────────────────────────────
-- select * from public.platform_reward_terms();
-- select platform, status from public.reviews order by submitted_at desc limit 5;
