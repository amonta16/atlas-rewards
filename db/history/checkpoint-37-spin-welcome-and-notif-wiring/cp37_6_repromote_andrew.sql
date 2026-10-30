-- =====================================================================
-- CP-37.6 — Re-promote Andrew's account to agency_admin
-- =====================================================================
-- The agency surface checks for a `business_users` row with
-- role='agency_admin' (business_id NULL for agency-wide admin). Andrew
-- is currently locked out with "Not an agency admin / promote yourself
-- in business_users with role=agency_admin" — somewhere along the
-- migrations his row got removed or never made it onto the new DB.
--
-- This block:
--   1. Finds Andrew's auth.users id by email.
--   2. Removes any non-admin role rows for him (so the cleanup is clean).
--   3. Inserts the agency_admin row with business_id IS NULL.
--   4. Reports the user id + final row state so you can confirm.
--
-- Safe to re-run; ON CONFLICT no-ops on the second pass.
-- =====================================================================

DO $$
DECLARE
  v_user_id uuid;
  v_existing_admin int;
  v_other_rows     int;
BEGIN
  SELECT id INTO v_user_id
    FROM auth.users
   WHERE lower(email::text) = 'andrewmontano619@gmail.com'
   LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'auth.users row for andrewmontano619@gmail.com not found — confirm signup completed first';
  END IF;

  -- Snapshot what exists right now (for the NOTICE output).
  SELECT count(*) INTO v_existing_admin
    FROM public.business_users
   WHERE user_id = v_user_id
     AND role = 'agency_admin'
     AND business_id IS NULL;

  SELECT count(*) INTO v_other_rows
    FROM public.business_users
   WHERE user_id = v_user_id
     AND NOT (role = 'agency_admin' AND business_id IS NULL);

  RAISE NOTICE 'Before: user_id=%, existing_admin_rows=%, other_role_rows=%',
    v_user_id, v_existing_admin, v_other_rows;

  -- Insert the agency_admin row if it's not already there.
  -- Tolerate either a UNIQUE constraint on (user_id, business_id, role)
  -- or no constraint at all — the explicit EXISTS guard keeps the row
  -- count to one.
  IF NOT EXISTS (
    SELECT 1 FROM public.business_users
     WHERE user_id = v_user_id
       AND role = 'agency_admin'
       AND business_id IS NULL
  ) THEN
    INSERT INTO public.business_users (user_id, business_id, role)
    VALUES (v_user_id, NULL, 'agency_admin');
    RAISE NOTICE 'Inserted agency_admin row for %', v_user_id;
  ELSE
    RAISE NOTICE 'agency_admin row already exists for %', v_user_id;
  END IF;

  RAISE NOTICE 'Done. Sign out and back in to /login.';
END $$;

-- Verify — should return one row with role='agency_admin', business_id IS NULL.
SELECT u.email,
       bu.role,
       bu.business_id,
       b.slug AS business_slug
  FROM auth.users u
  JOIN public.business_users bu ON bu.user_id = u.id
  LEFT JOIN public.businesses b ON b.id = bu.business_id
 WHERE lower(u.email::text) = 'andrewmontano619@gmail.com'
 ORDER BY bu.role;
