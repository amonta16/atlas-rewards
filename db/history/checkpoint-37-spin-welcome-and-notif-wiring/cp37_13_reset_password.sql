-- =====================================================================
-- CP-37.13 — Directly reset a stuck account's password
-- =====================================================================
-- Use when an invited team member can't sign in even though you "just
-- set" the password. The most common cause: the account was created
-- before the CP-37.12 password-update fix shipped, so Supabase still
-- has the ORIGINAL password from whichever flow first inserted them.
--
-- This runs in the Supabase SQL editor as the service role, which is
-- allowed to write auth.users.encrypted_password directly.
--
-- Edit the two values inside the DO block before running:
--   v_email         — the account to reset
--   v_new_password  — the password they should sign in with after this
--
-- The script also confirms the email (if not already), so password +
-- email-confirm gate are both fixed in one shot.
-- =====================================================================

DO $$
DECLARE
  v_email        text := 'villagomezfo499@gmail.com';
  v_new_password text := 'Atlas12345!';   -- ← change to whatever you want them to use
  v_user_id      uuid;
  v_was_unconfirmed boolean;
BEGIN
  SELECT id, email_confirmed_at IS NULL
    INTO v_user_id, v_was_unconfirmed
    FROM auth.users
   WHERE lower(email::text) = lower(v_email);

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No auth.users row for %', v_email;
  END IF;

  UPDATE auth.users
     SET encrypted_password = extensions.crypt(v_new_password, extensions.gen_salt('bf')),
         email_confirmed_at = COALESCE(email_confirmed_at, now()),
         updated_at         = now()
   WHERE id = v_user_id;

  RAISE NOTICE 'Reset password for % (user_id=%, was_unconfirmed=%). New password: %',
    v_email, v_user_id, v_was_unconfirmed, v_new_password;
  RAISE NOTICE 'They can now sign in at the appropriate login page with the password above.';
END $$;


-- ─── Verify ──────────────────────────────────────────────────────────
SELECT u.email,
       u.id AS user_id,
       u.email_confirmed_at::text AS email_confirmed_at,
       u.last_sign_in_at::text    AS last_sign_in_at,
       (u.encrypted_password IS NOT NULL) AS has_password,
       jsonb_agg(jsonb_build_object(
         'role', bu.role,
         'business_id', bu.business_id,
         'business_slug', b.slug
       )) FILTER (WHERE bu.user_id IS NOT NULL) AS roles
  FROM auth.users u
  LEFT JOIN public.business_users bu ON bu.user_id = u.id
  LEFT JOIN public.businesses b      ON b.id = bu.business_id
 WHERE lower(u.email::text) = lower('villagomezfo499@gmail.com')
 GROUP BY u.id;
