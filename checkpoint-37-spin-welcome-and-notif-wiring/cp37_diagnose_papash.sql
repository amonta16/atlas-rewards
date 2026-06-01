-- =====================================================================
-- CP-37 — One-off diagnostic for papash2021@gmail.com login failure
-- =====================================================================
-- Run AFTER cp37_migration.sql (which creates public.diagnose_login).
-- Paste this block into the Supabase SQL editor.
--
-- Read the output left-to-right:
--
--   auth_user_exists = false
--     → Your friend never finished signup. Have them visit your
--       business URL and tap "Join" — that creates the auth user +
--       profile + membership in one shot.
--
--   auth_user_exists = true  AND  email_confirmed_at IS NULL
--     → Account exists but email was never confirmed. Either resend
--       the confirmation email from Supabase Auth, or have them tap
--       "Forgot password?" on the login page — Supabase will send a
--       magic link that doubles as confirmation.
--
--   has_password = false
--     → They signed up via magic-link or invite and never set a
--       password. The "Rodriguez0188" they're typing isn't a password —
--       there isn't one yet. Two fixes:
--         (a) Send them /login (no email param) and tell them to
--             tap "Forgot password?". That mints a magic link they
--             can sign in with, then set a password from Profile.
--         (b) Or run:
--               -- service-role only, not authenticated callers
--               UPDATE auth.users
--                  SET encrypted_password = crypt('NEW_PASSWORD_HERE', gen_salt('bf'))
--                WHERE email = 'papash2021@gmail.com';
--
--   memberships = 0
--     → They have an account but never joined YOUR business. Send
--       them the per-business URL: https://app.atlas-engine.app/<slug>
--       and have them tap "Join".
--
--   memberships > 0 AND business_slugs doesn't contain the slug they're
--     signing into:
--     → Wrong sub-account. The /login?email=... link goes to the same
--       app shell, but they need to be on the correct /<slug>/app
--       after signing in. Re-send the per-business URL.
-- =====================================================================

SELECT * FROM public.diagnose_login('papash2021@gmail.com');

-- Bonus: dump the raw auth.users row (everything diagnose_login
-- summarized, raw). Requires service role to read auth schema directly.
SELECT id, email, email_confirmed_at, last_sign_in_at,
       raw_app_meta_data, raw_user_meta_data,
       (encrypted_password IS NOT NULL) AS has_password,
       created_at
  FROM auth.users
 WHERE email = lower(btrim('papash2021@gmail.com'));

-- Bonus: any memberships this email is attached to (regardless of
-- which sub-account / agency).
SELECT m.id              AS membership_id,
       m.points_balance,
       m.tier,
       m.joined_at,
       b.slug            AS business_slug,
       b.name            AS business_name
  FROM auth.users u
  JOIN public.business_memberships m ON m.user_id = u.id
  JOIN public.businesses b           ON b.id = m.business_id
 WHERE u.email = lower(btrim('papash2021@gmail.com'));
