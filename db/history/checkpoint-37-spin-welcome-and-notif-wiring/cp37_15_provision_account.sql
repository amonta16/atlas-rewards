-- =====================================================================
-- CP-37.15 — admin_provision_account RPC
-- =====================================================================
-- Replaces the Supabase admin SDK's createUser/updateUserById dance
-- that was producing accounts customers couldn't sign in to. This RPC
-- writes auth.users directly via the same path the cp37_14 fresh-
-- start script used — and Andrew confirmed THAT works (he signed in
-- as andrewmontano619 after fresh-start ran).
--
-- Called by /api/team/create-account (next file in this checkpoint).
-- SECURITY DEFINER + permission gate inside: caller must already be
-- agency_admin OR a business_manager for the same business.
--
-- Idempotent. Handles all four cases:
--   • brand-new email → create auth.users + profiles + business_users
--   • existing email,   no role   → set password + add role
--   • existing email + this role  → reset password (the re-invite use case)
--   • existing email + wrong role → set password + replace role
--
-- Returns the user_id so the route can build a sign-in URL.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.admin_provision_account(
  p_email       text,
  p_password    text,
  p_role        text,
  p_business_id uuid,   -- NULL for agency_admin
  p_full_name   text DEFAULT NULL
)
RETURNS TABLE (user_id uuid, created_new boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller   uuid := auth.uid();
  v_email    text := lower(btrim(p_email));
  v_uid      uuid;
  v_created  boolean := false;
  v_pw_hash  text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- ─── Permission gate ────────────────────────────────────────
  -- agency_admin can provision anything.
  -- business_manager can provision business_manager + business_staff
  -- for their OWN business only.
  IF EXISTS (
    SELECT 1 FROM public.business_users
     WHERE user_id = v_caller AND role = 'agency_admin'
       AND (business_id IS NULL OR business_id = p_business_id)
  ) THEN
    NULL; -- ok
  ELSIF p_role IN ('business_manager','business_staff')
        AND p_business_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.business_users
           WHERE user_id = v_caller AND role = 'business_manager'
             AND business_id = p_business_id
        )
  THEN
    NULL; -- ok
  ELSE
    RAISE EXCEPTION 'permission denied for role %', p_role;
  END IF;

  IF p_role NOT IN ('agency_admin','business_manager','business_staff') THEN
    RAISE EXCEPTION 'invalid role: %', p_role;
  END IF;
  IF p_role <> 'agency_admin' AND p_business_id IS NULL THEN
    RAISE EXCEPTION 'business_id required for role %', p_role;
  END IF;
  IF length(p_password) < 8 THEN
    RAISE EXCEPTION 'password must be at least 8 characters';
  END IF;

  -- ─── Mint the bcrypt hash via pgcrypto ─────────────────────
  v_pw_hash := extensions.crypt(p_password, extensions.gen_salt('bf'));

  -- ─── Find or create the auth.users row ─────────────────────
  SELECT id INTO v_uid FROM auth.users WHERE lower(email::text) = v_email;

  IF v_uid IS NULL THEN
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
      v_email,
      v_pw_hash,
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', COALESCE(p_full_name, '')),
      now(), now()
    )
    RETURNING id INTO v_uid;
    v_created := true;
  ELSE
    -- Existing user — overwrite password + force-confirm email.
    -- This is the path that fixes the "I just re-invited them with
    -- a new password but they still can't sign in" bug.
    UPDATE auth.users
       SET encrypted_password = v_pw_hash,
           email_confirmed_at = COALESCE(email_confirmed_at, now()),
           updated_at         = now(),
           raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
              || jsonb_build_object('full_name',
                   COALESCE(NULLIF(p_full_name, ''),
                            raw_user_meta_data->>'full_name', ''))
     WHERE id = v_uid;
  END IF;

  -- ─── Profile row ──────────────────────────────────────────
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (v_uid, COALESCE(p_full_name, ''), v_email)
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), profiles.full_name);

  -- ─── business_users row ──────────────────────────────────
  -- Remove any other role rows for this user on this business so
  -- the new role replaces (not stacks on) the old one.
  DELETE FROM public.business_users
   WHERE user_id = v_uid
     AND COALESCE(business_id, '00000000-0000-0000-0000-000000000000'::uuid)
       = COALESCE(p_business_id, '00000000-0000-0000-0000-000000000000'::uuid);

  INSERT INTO public.business_users (user_id, business_id, role)
  VALUES (v_uid, p_business_id, p_role);

  user_id := v_uid;
  created_new := v_created;
  RETURN NEXT;
END; $$;

GRANT EXECUTE ON FUNCTION public.admin_provision_account(text, text, text, uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
