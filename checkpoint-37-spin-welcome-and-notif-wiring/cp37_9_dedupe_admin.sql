-- =====================================================================
-- CP-37.9 — Dedupe agency_admin rows + add unique constraint
-- =====================================================================
-- Root cause of the persistent "Not an agency admin" gate:
-- multiple agency_admin rows exist for the same user. The agency page
-- query used .maybeSingle() (one row or none) which RAISES when >1
-- row comes back — the error gets surfaced as data=null and the gate
-- says "Not an agency admin" even though the user IS an admin.
--
-- This script:
--   1. Dedupes business_users rows so each (user_id, business_id, role)
--      combo appears at most once. Keeps the OLDEST id (most stable).
--   2. Adds a unique constraint so future promote scripts can't
--      create duplicates.
--   3. Reports the final state.
--
-- The accompanying code fix (cp37_9 edits to /agency/page.tsx) makes
-- the page gate tolerant — uses .limit(1) instead of .maybeSingle() —
-- so even if duplicates somehow return, the page no longer fails.
-- =====================================================================


-- ---------------------------------------------------------------------
-- (1) Dedupe — keep the oldest row per (user_id, business_id, role).
-- ---------------------------------------------------------------------
-- For agency_admin rows, business_id is NULL by convention; the
-- USING IS NOT DISTINCT FROM syntax treats NULL as a value so two
-- NULL business_ids are considered the same group.

WITH ranked AS (
  SELECT id,
         user_id,
         business_id,
         role,
         row_number() OVER (
           PARTITION BY user_id, business_id, role
           ORDER BY id
         ) AS rn
    FROM public.business_users
)
DELETE FROM public.business_users bu
 USING ranked r
 WHERE bu.id = r.id
   AND r.rn > 1;

-- Report how many we cleaned up.
DO $$
DECLARE v_left int;
BEGIN
  SELECT count(*) INTO v_left FROM public.business_users WHERE role = 'agency_admin';
  RAISE NOTICE 'CP-37.9: business_users agency_admin rows remaining = %', v_left;
END $$;


-- ---------------------------------------------------------------------
-- (2) Future-proof: unique index so no one can re-create duplicates.
-- ---------------------------------------------------------------------
-- COALESCE the NULL business_id to a sentinel UUID so the index
-- treats NULLs as equal. Without this, NULL != NULL in indexes and
-- duplicates leak back in.

DROP INDEX IF EXISTS business_users_uniq_role_idx;
CREATE UNIQUE INDEX business_users_uniq_role_idx
  ON public.business_users (
    user_id,
    COALESCE(business_id, '00000000-0000-0000-0000-000000000000'::uuid),
    role
  );


-- ---------------------------------------------------------------------
-- (3) Final state — should list one row per (user, role) pair.
-- ---------------------------------------------------------------------
SELECT 'Final state' AS step,
       u.email,
       bu.role,
       bu.business_id::text AS business_id,
       b.slug AS business_slug
  FROM public.business_users bu
  JOIN auth.users u ON u.id = bu.user_id
  LEFT JOIN public.businesses b ON b.id = bu.business_id
 ORDER BY u.email, bu.role, b.slug NULLS FIRST;

NOTIFY pgrst, 'reload schema';
