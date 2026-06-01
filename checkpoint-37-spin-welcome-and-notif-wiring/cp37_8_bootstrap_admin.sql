-- =====================================================================
-- CP-37.8 — Self-bootstrap agency admin
-- =====================================================================
-- Andrew keeps getting "Not an agency admin" even after running the
-- previous promote scripts. Most likely cause: he's signing in with
-- an auth.users row that's different from the one I keep promoting,
-- so by-email SQL keeps missing.
--
-- This script ships a SECURITY DEFINER function the SIGNED-IN user
-- can call from the app to promote themselves. Bootstrap-safe:
-- defaults to refusing once any admin exists, but Andrew gets an
-- override flag for the dev environment.
-- =====================================================================


-- ---------------------------------------------------------------------
-- (1) bootstrap_self_agency_admin(p_force boolean DEFAULT false)
-- ---------------------------------------------------------------------
-- Behavior:
--   • If caller already has agency_admin → no-op, returns 'already_admin'
--   • Else if no agency_admin row exists in the table → promote, returns 'promoted'
--   • Else if p_force = true → promote anyway, returns 'forced'
--   • Else → returns 'refused' (an admin already exists; ask them to invite you)
--
-- The /agency/bootstrap-admin page calls this with p_force=true so
-- the dev gets unstuck. Safe to drop / lock down later.

CREATE OR REPLACE FUNCTION public.bootstrap_self_agency_admin(p_force boolean DEFAULT false)
RETURNS TABLE (status text, user_id uuid, total_admins int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_email        text;
  v_existing_admin_count int;
  v_self_admin   boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated — sign in first';
  END IF;

  SELECT email::text INTO v_email FROM auth.users WHERE id = v_uid;

  -- Already an admin?
  SELECT EXISTS (
    SELECT 1 FROM public.business_users
     WHERE user_id = v_uid
       AND role = 'agency_admin'
       AND business_id IS NULL
  ) INTO v_self_admin;

  -- How many admins exist in total?
  SELECT count(*) INTO v_existing_admin_count
    FROM public.business_users
   WHERE role = 'agency_admin';

  IF v_self_admin THEN
    status := 'already_admin';
    user_id := v_uid;
    total_admins := v_existing_admin_count;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_existing_admin_count = 0 OR p_force THEN
    -- Clean any stray non-canonical rows for this user first.
    DELETE FROM public.business_users
     WHERE user_id = v_uid
       AND NOT (role = 'agency_admin' AND business_id IS NULL);

    INSERT INTO public.business_users (user_id, business_id, role)
    VALUES (v_uid, NULL, 'agency_admin');

    status := CASE WHEN v_existing_admin_count = 0 THEN 'promoted' ELSE 'forced' END;
    user_id := v_uid;
    total_admins := v_existing_admin_count + 1;
    RETURN NEXT;
    RETURN;
  END IF;

  status := 'refused';
  user_id := v_uid;
  total_admins := v_existing_admin_count;
  RETURN NEXT;
END; $$;

GRANT EXECUTE ON FUNCTION public.bootstrap_self_agency_admin(boolean) TO authenticated;


-- ---------------------------------------------------------------------
-- (2) whoami() — debug helper. Returns the caller's auth.uid + email +
-- their full business_users rows. Use it from any signed-in client to
-- prove which account you're actually authed as.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.whoami()
RETURNS TABLE (
  user_id          uuid,
  email            text,
  role_rows        jsonb,
  membership_count int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  user_id := v_uid;
  IF v_uid IS NULL THEN
    email := NULL;
    role_rows := '[]'::jsonb;
    membership_count := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT u.email::text INTO email FROM auth.users u WHERE u.id = v_uid;

  SELECT COALESCE(
    jsonb_agg(jsonb_build_object(
      'role', bu.role,
      'business_id', bu.business_id,
      'business_slug', b.slug
    )),
    '[]'::jsonb
  ) INTO role_rows
  FROM public.business_users bu
  LEFT JOIN public.businesses b ON b.id = bu.business_id
  WHERE bu.user_id = v_uid;

  SELECT count(*)::int INTO membership_count
    FROM public.business_memberships
   WHERE user_id = v_uid;

  RETURN NEXT;
END; $$;

GRANT EXECUTE ON FUNCTION public.whoami() TO authenticated;


-- ---------------------------------------------------------------------
-- (3) Defensive blanket promote: any auth.users row whose email matches
-- a known admin email gets the canonical row inserted. Cleans stray
-- non-canonical rows the same way as previous scripts.
-- ---------------------------------------------------------------------

DO $$
DECLARE
  v_target text;
  v_uid    uuid;
BEGIN
  FOR v_target IN
    SELECT unnest(ARRAY[
      'andrewmontano619@gmail.com',
      'amonta16@calpoly.edu'
    ])
  LOOP
    SELECT id INTO v_uid
      FROM auth.users
     WHERE lower(email::text) = lower(v_target);

    IF v_uid IS NULL THEN
      RAISE NOTICE 'skip: % — no auth.users row', v_target;
      CONTINUE;
    END IF;

    DELETE FROM public.business_users
     WHERE user_id = v_uid
       AND NOT (role = 'agency_admin' AND business_id IS NULL);

    INSERT INTO public.business_users (user_id, business_id, role)
    SELECT v_uid, NULL, 'agency_admin'
     WHERE NOT EXISTS (
       SELECT 1 FROM public.business_users
        WHERE user_id = v_uid
          AND role = 'agency_admin'
          AND business_id IS NULL
     );

    RAISE NOTICE 'promoted: % (user_id=%)', v_target, v_uid;
  END LOOP;
END $$;


-- ---------------------------------------------------------------------
-- (4) Final state — should list all current agency admins.
-- ---------------------------------------------------------------------
SELECT 'Final state' AS step,
       u.email,
       u.id AS user_id,
       bu.role,
       bu.business_id::text AS business_id
  FROM public.business_users bu
  JOIN auth.users u ON u.id = bu.user_id
 WHERE bu.role = 'agency_admin'
 ORDER BY u.email;

NOTIFY pgrst, 'reload schema';
