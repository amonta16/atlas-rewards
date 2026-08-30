-- =====================================================================
-- Atlas · CP-117 — front-desk member lookup HOTFIX (P0)
-- =====================================================================
-- SYMPTOM: front desk / QR scan says "No member, redemption, or gift found"
-- for EVERY code on EVERY shop; no member profile ever loads.
--
-- ROOT CAUSE: CP-110 added a `staffs_business()` gate to
-- resolve_member_by_code and RAISES on failure. The manager-dashboard
-- lookup ignores the RPC error field, so ANY error from that function is
-- masked as a plain "not found". `staffs_business()` calls the helper
-- functions is_agency_admin()/is_agency_va(); if any link in that chain is
-- stale/missing on the live DB (this project has a documented history of
-- migrations not fully applying), the gate ERRORS for every caller and the
-- desk can't look anyone up.
--
-- FIX (two layers, both non-destructive create-or-replace):
--   1. Re-assert the helper chain (is_agency_admin, is_agency_va,
--      staffs_business) to their correct definitions, repairing any drift —
--      this also restores every OTHER RPC gated on them (redemptions,
--      undo, billing, analytics).
--   2. Make resolve_member_by_code SELF-CONTAINED: it checks staff access
--      inline against business_users (no helper dependency, so it can never
--      error from a missing function) and RETURNS NOTHING for a non-staff
--      caller instead of raising — same PII protection as CP-110 (a
--      non-staff caller still gets zero member rows), but a clean empty
--      result the client handles gracefully.
--
-- Safe to run on production and safe to re-run.
-- =====================================================================

begin;

-- ── 1. repair the helper chain (drift-proof) ─────────────────────────
create or replace function public.is_agency_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.business_users
     where user_id = auth.uid() and role = 'agency_admin'
  );
$$;
grant execute on function public.is_agency_admin() to authenticated;

create or replace function public.is_agency_va()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.business_users
     where user_id = auth.uid() and role = 'agency_va'
  );
$$;
grant execute on function public.is_agency_va() to authenticated;

create or replace function public.staffs_business(b_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.business_users
     where user_id = auth.uid() and business_id = b_id
  ) or public.is_agency_admin()
    or public.is_agency_va();
$$;
grant execute on function public.staffs_business(uuid) to authenticated;

-- ── 2. self-contained, error-proof member resolver ──────────────────
create or replace function public.resolve_member_by_code(p_code text, p_business_id uuid)
returns table (
  membership_id uuid, user_id uuid, full_name text, email text, phone text,
  points_balance integer, tier text, joined_at timestamptz, visit_count integer
)
language plpgsql stable security definer set search_path = public as $$
begin
  -- Inline staff check — no dependency on helper functions, so a stale/
  -- missing helper can never make this error (which the front-desk client
  -- masks as "not found"). Non-staff callers get NO rows (PII protected),
  -- not a raised exception.
  if not exists (
    select 1 from public.business_users bu
     where bu.user_id = auth.uid()
       and (bu.business_id = p_business_id
            or (bu.business_id is null and bu.role in ('agency_admin','agency_va')))
  ) then
    return;
  end if;

  return query
    select m.id, m.user_id, p.full_name, p.email, p.phone,
           m.points_balance, m.tier, m.joined_at, m.visit_count
      from public.business_memberships m
      join public.profiles p on p.id = m.user_id
     where m.referral_code = p_code
       and m.business_id = p_business_id
     limit 1;
end; $$;
grant execute on function public.resolve_member_by_code(text, uuid) to authenticated;

commit;

-- =====================================================================
-- After applying, at the desk: scan a member QR (or type their 6-char
-- code) → the member profile should load. If it STILL says "not found"
-- for a code you KNOW exists, the issue is the code value itself, not
-- permissions — run:
--   select referral_code from public.business_memberships
--    where business_id = '<this business id>' limit 20;
-- and compare to what the QR encodes.
-- =====================================================================
