-- =====================================================================
-- CP-42 — Delete stuck team accounts
-- =====================================================================
-- Andrew's preexisting invite flow left some team accounts in a half-
-- created state — auth.users rows exist but pending_invitations were
-- never accepted, so the friends can't sign up "for the first time"
-- (Supabase says "User already registered") and can't sign in
-- (because no password was ever set).
--
-- This one-shot script wipes those stuck accounts so the new
-- admin-creates-the-account flow can re-create them cleanly.
--
-- Keeps Andrew's own account (andrewmontano619@gmail.com) intact.
-- Run from Supabase SQL editor.
-- =====================================================================

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 1. PREVIEW: what will get deleted                                │
-- │    Run this first to make sure the list looks right.             │
-- └─────────────────────────────────────────────────────────────────┘
SELECT
  u.id,
  u.email,
  u.created_at,
  COALESCE(p.full_name, '(no profile)') AS full_name,
  (SELECT COUNT(*) FROM public.business_users     bu WHERE bu.user_id = u.id) AS business_user_rows,
  (SELECT COUNT(*) FROM public.pending_invitations pi WHERE lower(pi.email) = lower(u.email::text)) AS pending_invites
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE lower(u.email::text) NOT IN (
  'andrewmontano619@gmail.com'        -- KEEP: Andrew's account
  -- Add any other accounts you want to keep here, lowercase, one per line.
)
-- Only target accounts that were never enrolled as a customer
-- anywhere (so we don't accidentally delete a paying member).
AND NOT EXISTS (
  SELECT 1 FROM public.business_memberships m WHERE m.user_id = u.id
);

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 2. DELETE — uncomment the block below AFTER reviewing step 1.   │
-- │    Cascade FKs handle business_users + pending_invitations.     │
-- └─────────────────────────────────────────────────────────────────┘
-- DO $$
-- DECLARE
--   v_user record;
--   v_deleted int := 0;
-- BEGIN
--   FOR v_user IN
--     SELECT u.id, u.email
--     FROM auth.users u
--     WHERE lower(u.email::text) NOT IN (
--       'andrewmontano619@gmail.com'
--       -- ... add any other accounts to keep ...
--     )
--     AND NOT EXISTS (SELECT 1 FROM public.business_memberships m WHERE m.user_id = u.id)
--   LOOP
--     -- Drop any pending invitations for this email so the address is
--     -- fully free to be re-invited.
--     DELETE FROM public.pending_invitations
--      WHERE lower(email) = lower(v_user.email::text);
--
--     -- Drop their business_users role rows (FK ON DELETE CASCADE
--     -- handles this automatically too, but explicit is safer).
--     DELETE FROM public.business_users WHERE user_id = v_user.id;
--
--     -- Drop their profile row.
--     DELETE FROM public.profiles WHERE id = v_user.id;
--
--     -- Finally drop the auth.users row.
--     DELETE FROM auth.users WHERE id = v_user.id;
--
--     v_deleted := v_deleted + 1;
--     RAISE NOTICE 'deleted %', v_user.email;
--   END LOOP;
--
--   RAISE NOTICE 'total deleted: %', v_deleted;
-- END $$;

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 3. Alternative: nuke just ONE specific email at a time          │
-- │    Replace the email below and run.                              │
-- └─────────────────────────────────────────────────────────────────┘
-- DO $$
-- DECLARE v_id uuid;
-- BEGIN
--   SELECT id INTO v_id FROM auth.users
--    WHERE lower(email::text) = lower('nlocampo74@gmail.com');  -- ← change this
--   IF v_id IS NULL THEN
--     RAISE NOTICE 'no auth.users row for that email — nothing to do';
--   ELSE
--     DELETE FROM public.pending_invitations WHERE lower(email) = lower('nlocampo74@gmail.com');
--     DELETE FROM public.business_users     WHERE user_id = v_id;
--     DELETE FROM public.profiles           WHERE id      = v_id;
--     DELETE FROM auth.users                WHERE id      = v_id;
--     RAISE NOTICE 'deleted account for %', 'nlocampo74@gmail.com';
--   END IF;
-- END $$;
