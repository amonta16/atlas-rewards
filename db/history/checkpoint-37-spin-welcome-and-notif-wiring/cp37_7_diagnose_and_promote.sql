-- =====================================================================
-- CP-37.7 — Diagnose + force-promote Andrew (and a generic admin tool)
-- =====================================================================
-- The CP-37.6 promote ran but the agency page still says "Not an
-- agency admin". This script does three things you can run in one
-- pass:
--
--   STEP A — Print every business_users row tied to your account,
--            and every business_users row that anyone currently
--            has with role='agency_admin'. If something looks
--            wrong (wrong user_id, weird role, business_id non-null),
--            you'll see it in the output panel.
--
--   STEP B — Force-upsert the agency_admin row. Removes anything
--            on this user that's mis-shaped, then inserts the
--            canonical (user_id, business_id=NULL, role='agency_admin')
--            triple. Idempotent.
--
--   STEP C — Verify. Returns one row. If you see role=agency_admin,
--            sign out + back in (hard-refresh the /agency page) and
--            you're back in.
--
-- Replace the email below if needed.
-- =====================================================================

-- ──────────────────────────────────────────────────────────────
-- Set the target email once, here.
-- ──────────────────────────────────────────────────────────────
-- NOTE: Supabase SQL editor doesn't support variables across
-- statements, so we just inline the email everywhere below.


-- ─── STEP A — Diagnose ────────────────────────────────────────
SELECT 'A1. auth.users row' AS step,
       u.id::text       AS user_id,
       u.email,
       u.email_confirmed_at::text  AS email_confirmed_at,
       u.last_sign_in_at::text     AS last_sign_in_at
  FROM auth.users u
 WHERE lower(u.email::text) = lower('andrewmontano619@gmail.com');

SELECT 'A2. ALL business_users rows for this user' AS step,
       bu.role,
       bu.business_id,
       b.slug AS business_slug,
       b.name AS business_name
  FROM auth.users u
  JOIN public.business_users bu ON bu.user_id = u.id
  LEFT JOIN public.businesses b ON b.id = bu.business_id
 WHERE lower(u.email::text) = lower('andrewmontano619@gmail.com')
 ORDER BY bu.role;

SELECT 'A3. Anyone in the database who has agency_admin' AS step,
       u.email,
       bu.role,
       bu.business_id::text
  FROM public.business_users bu
  JOIN auth.users u ON u.id = bu.user_id
 WHERE bu.role = 'agency_admin'
 ORDER BY u.email;


-- ─── STEP B — Force the agency_admin row into place ──────────
DO $$
DECLARE
  v_user_id     uuid;
  v_already     boolean;
BEGIN
  SELECT id INTO v_user_id
    FROM auth.users
   WHERE lower(email::text) = lower('andrewmontano619@gmail.com');

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No auth.users row for andrewmontano619@gmail.com. Did the signup ever complete?';
  END IF;

  -- Drop any stray business_users rows for this user that AREN'T
  -- the canonical agency_admin/null shape. Catches the case where
  -- a row exists with role='agency_admin' but a business_id set,
  -- which doesn't match the page's filter.
  DELETE FROM public.business_users
   WHERE user_id = v_user_id
     AND NOT (role = 'agency_admin' AND business_id IS NULL);

  -- Insert the canonical row if not present.
  SELECT EXISTS (
    SELECT 1 FROM public.business_users
     WHERE user_id = v_user_id
       AND role = 'agency_admin'
       AND business_id IS NULL
  ) INTO v_already;

  IF NOT v_already THEN
    INSERT INTO public.business_users (user_id, business_id, role)
    VALUES (v_user_id, NULL, 'agency_admin');
    RAISE NOTICE 'STEP B — inserted canonical agency_admin row for %', v_user_id;
  ELSE
    RAISE NOTICE 'STEP B — canonical agency_admin row already present for %', v_user_id;
  END IF;
END $$;


-- ─── STEP C — Verify ─────────────────────────────────────────
SELECT 'C. Final state — should have exactly one row, role=agency_admin, business_id NULL' AS step,
       u.email,
       bu.role,
       bu.business_id::text
  FROM auth.users u
  JOIN public.business_users bu ON bu.user_id = u.id
 WHERE lower(u.email::text) = lower('andrewmontano619@gmail.com');

-- After this returns role='agency_admin' with NULL business_id:
--   1. Sign out at the top right of /agency (if it shows the gate)
--   2. Go to /login  →  sign in again
--   3. /agency loads My Apps + Team + Settings as normal.
-- If you're still stuck, hard-refresh (Cmd/Ctrl+Shift+R) — Next.js
-- caches the server response for the /agency route until the auth
-- cookie changes.
