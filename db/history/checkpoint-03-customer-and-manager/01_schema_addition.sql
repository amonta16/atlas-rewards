-- =====================================================================
-- CHECKPOINT 3 — Schema additions on top of CP 1
-- Run this in Supabase SQL Editor (New query).
-- =====================================================================

-- Hero image per business for the customer Home tab
alter table public.businesses
  add column if not exists hero_image_url text;

-- Allow authenticated users (customers) to enroll themselves into a business
-- by calling enroll_member(business_id). The function we built in CP 1
-- already runs as security definer, so customers can call it.
grant execute on function public.enroll_member(uuid, uuid) to authenticated;

-- Self-service membership view function — returns the caller's membership
-- for a given business (or null if not yet enrolled). Used on every
-- customer-side page load.
create or replace function public.my_membership(p_business_id uuid)
returns table (
  id uuid, points_balance integer, tier text, lifetime_points_earned integer,
  visit_count integer, last_visit_at timestamptz, joined_at timestamptz,
  referral_code text, status text
)
language sql stable security definer set search_path = public as $$
  select id, points_balance, tier, lifetime_points_earned,
         visit_count, last_visit_at, joined_at, referral_code, status
    from public.business_memberships
   where business_id = p_business_id and user_id = auth.uid()
   limit 1;
$$;
grant execute on function public.my_membership(uuid) to authenticated;

-- Manager-side: resolve a member by referral_code (what the QR encodes).
-- Returns enough to populate the manager's "scan result" screen.
create or replace function public.resolve_member_by_code(p_code text, p_business_id uuid)
returns table (
  membership_id uuid, user_id uuid, full_name text, email text, phone text,
  points_balance integer, tier text, joined_at timestamptz, visit_count integer
)
language sql stable security definer set search_path = public as $$
  select m.id, m.user_id, p.full_name, p.email, p.phone,
         m.points_balance, m.tier, m.joined_at, m.visit_count
    from public.business_memberships m
    join public.profiles p on p.id = m.user_id
   where m.referral_code = p_code
     and m.business_id = p_business_id
   limit 1;
$$;
grant execute on function public.resolve_member_by_code(text, uuid) to authenticated;
