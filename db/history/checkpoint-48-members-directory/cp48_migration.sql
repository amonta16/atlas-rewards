-- =====================================================================
-- CP-48 — front-desk members directory + member password reset
-- =====================================================================
-- Idempotent. Apply the whole file in the Supabase SQL editor.
--
-- 1. list_business_members — every member of a business (paginated), for
--    the new front-desk Users tab. Same shape as search_members so the
--    UI can reuse the member type. Staff-gated.
-- 2. staff_can_manage_member — true when the caller may reset a given
--    member's password: agency_admin, OR staff/manager of a business the
--    member belongs to. Used by /api/team/reset-member-password.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. list_business_members(p_business_id, p_limit, p_offset)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.list_business_members(uuid, integer, integer);

CREATE OR REPLACE FUNCTION public.list_business_members(
  p_business_id uuid,
  p_limit       integer DEFAULT 500,
  p_offset      integer DEFAULT 0
)
RETURNS TABLE (
  membership_id  uuid,
  user_id        uuid,
  full_name      text,
  email          text,
  phone          text,
  referral_code  text,
  points_balance integer,
  tier           text,
  joined_at      timestamptz,
  visit_count    integer,
  is_vip         boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.staffs_business(p_business_id) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  RETURN QUERY
    -- Explicit ::text casts because profiles.email is `citext`; without the
    -- cast the column type won't match the declared `text` return type
    -- ("structure of query does not match function result type").
    -- is_vip = active PAID membership (CP-34 membership_payment_status).
    SELECT m.id, m.user_id,
           p.full_name::text, p.email::text, p.phone::text,
           m.referral_code::text, m.points_balance, m.tier::text,
           m.joined_at, m.visit_count,
           COALESCE(m.membership_payment_status = 'paid', false)
      FROM public.business_memberships m
      JOIN public.profiles p ON p.id = m.user_id
     WHERE m.business_id = p_business_id
     ORDER BY coalesce(m.last_visit_at, m.joined_at) DESC
     LIMIT GREATEST(p_limit, 1) OFFSET GREATEST(p_offset, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_business_members(uuid, integer, integer) TO authenticated;


-- ---------------------------------------------------------------------
-- 2. staff_can_manage_member(p_member_user_id)
-- ---------------------------------------------------------------------
-- May the caller reset this member's password? agency_admin can manage
-- anyone; a manager/front-desk can manage members of a business they
-- staff. SECURITY DEFINER so it can read business_users for the check.
DROP FUNCTION IF EXISTS public.staff_can_manage_member(uuid);

CREATE OR REPLACE FUNCTION public.staff_can_manage_member(p_member_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_agency_admin()
      OR EXISTS (
        SELECT 1
          FROM public.business_memberships bm
          JOIN public.business_users bu ON bu.business_id = bm.business_id
         WHERE bm.user_id = p_member_user_id
           AND bu.user_id = auth.uid()
           AND bu.role IN ('business_manager', 'business_staff')
      );
$$;

GRANT EXECUTE ON FUNCTION public.staff_can_manage_member(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
