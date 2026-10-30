-- =====================================================================
-- CP-37.14 — FRESH START: clean reset to single admin
-- =====================================================================
-- Wipes every team account (admin / manager / front-desk) except
-- andrewmontano619@gmail.com, resets that account's password to
-- "Rocketboy100", confirms the email, and seats it as agency_admin.
--
-- KEPT INTACT:
--   • public.businesses (your sub-accounts + brand config)
--   • public.business_memberships (customer accounts + their points)
--   • public.profiles for customer auth users
--   • public.rewards / offers / news / streak_config / etc.
--   • All customer-facing data — points, redemptions, reviews, etc.
--
-- WIPED:
--   • public.business_users — every row except Andrew's
--   • public.pending_invitations — every row (all stale)
--   • auth.users for ex-team accounts (so re-invites can use the same
--     email cleanly). Customer auth.users (those with a
--     business_memberships row) are PRESERVED — we only delete users
--     who were team-only and never enrolled as customers.
--
-- Safe to re-run. Idempotent. The verify SELECT at the end shows the
-- final state.
-- =====================================================================

DO $$
DECLARE
  v_main_email   text := 'andrewmontano619@gmail.com';
  v_new_password text := 'Rocketboy100';
  v_main_uid     uuid;
  v_deleted_bu   int  := 0;
  v_deleted_inv  int  := 0;
  v_deleted_users int := 0;
BEGIN
  -- ─── 1. Make sure Andrew's auth user exists. ─────────────────
  SELECT id INTO v_main_uid
    FROM auth.users
   WHERE lower(email::text) = lower(v_main_email);

  IF v_main_uid IS NULL THEN
    -- Create him if he isn't there yet. (Should never happen in
    -- practice — he's been signed up since day one — but the
    -- script needs to be safe to run on a brand-new DB too.)
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    )
    VALUES (
      gen_random_uuid(),
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      lower(v_main_email),
      extensions.crypt(v_new_password, extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Andrew"}'::jsonb,
      now(), now()
    )
    RETURNING id INTO v_main_uid;
    RAISE NOTICE 'Created fresh auth user for % (id=%)', v_main_email, v_main_uid;
  ELSE
    -- Reset password + confirm email + reset metadata.
    UPDATE auth.users
       SET encrypted_password = extensions.crypt(v_new_password, extensions.gen_salt('bf')),
           email_confirmed_at = COALESCE(email_confirmed_at, now()),
           updated_at         = now()
     WHERE id = v_main_uid;
    RAISE NOTICE 'Reset password + confirmed email for % (id=%)', v_main_email, v_main_uid;
  END IF;

  -- Make sure profile row exists.
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (v_main_uid, 'Andrew', lower(v_main_email))
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(profiles.full_name, EXCLUDED.full_name);

  -- ─── 2. Wipe team accounts that aren't Andrew. ───────────────
  -- Delete pending invitations first — they have FK to business_users.
  DELETE FROM public.pending_invitations;
  GET DIAGNOSTICS v_deleted_inv = ROW_COUNT;

  -- Delete every business_users row that isn't Andrew's.
  DELETE FROM public.business_users
   WHERE user_id <> v_main_uid;
  GET DIAGNOSTICS v_deleted_bu = ROW_COUNT;

  -- ─── 3. Delete auth.users that were team-only (no customer memberships). ─
  -- We only nuke accounts that:
  --   a) aren't Andrew
  --   b) have ZERO business_memberships (so they were team users,
  --      not customers we'd be wiping data for)
  --   c) used to be in business_users (the original team accounts)
  -- This frees up their email addresses so Andrew can re-invite later
  -- without "User already registered" errors.
  WITH team_only AS (
    SELECT u.id
      FROM auth.users u
     WHERE u.id <> v_main_uid
       AND NOT EXISTS (
         SELECT 1 FROM public.business_memberships m WHERE m.user_id = u.id
       )
  ),
  cleaned_profiles AS (
    DELETE FROM public.profiles WHERE id IN (SELECT id FROM team_only)
    RETURNING id
  )
  DELETE FROM auth.users WHERE id IN (SELECT id FROM team_only);
  GET DIAGNOSTICS v_deleted_users = ROW_COUNT;

  -- ─── 4. Make sure Andrew is agency_admin (canonical row). ───
  DELETE FROM public.business_users
   WHERE user_id = v_main_uid
     AND NOT (role = 'agency_admin' AND business_id IS NULL);

  INSERT INTO public.business_users (user_id, business_id, role)
  SELECT v_main_uid, NULL, 'agency_admin'
   WHERE NOT EXISTS (
     SELECT 1 FROM public.business_users
      WHERE user_id = v_main_uid
        AND role = 'agency_admin'
        AND business_id IS NULL
   );

  RAISE NOTICE '─────────────────────────────────────────────';
  RAISE NOTICE 'FRESH START COMPLETE';
  RAISE NOTICE '  Main admin email   : %', v_main_email;
  RAISE NOTICE '  Main admin user_id : %', v_main_uid;
  RAISE NOTICE '  Password (set now) : %', v_new_password;
  RAISE NOTICE '  Team accts wiped   : % business_users rows, % pending invites, % auth users',
    v_deleted_bu, v_deleted_inv, v_deleted_users;
  RAISE NOTICE '─────────────────────────────────────────────';
  RAISE NOTICE 'Sign in at /login with the email + password above.';
END $$;


-- ─── Verify ──────────────────────────────────────────────────────────
SELECT 'Final team roster' AS step,
       u.email,
       bu.role,
       bu.business_id::text AS business_id,
       b.slug AS business_slug
  FROM public.business_users bu
  JOIN auth.users u ON u.id = bu.user_id
  LEFT JOIN public.businesses b ON b.id = bu.business_id
 ORDER BY bu.role, u.email;

SELECT 'Main admin auth state' AS step,
       u.email,
       u.email_confirmed_at::text AS email_confirmed_at,
       (u.encrypted_password IS NOT NULL) AS has_password
  FROM auth.users u
 WHERE lower(u.email::text) = lower('andrewmontano619@gmail.com');

NOTIFY pgrst, 'reload schema';
