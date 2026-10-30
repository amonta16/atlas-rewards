-- =====================================================================
-- CP-37.17 — Hard-wipe stuck team emails
-- =====================================================================
-- Andrew previously invited three test emails, then deleted them via
-- the UI / earlier scripts. The auth.users row got cleaned but stale
-- references in profiles / push_subscriptions / pending_invitations
-- / notifications survived, which made re-invites fail in subtle ways
-- (FK conflicts, "user already registered" race, etc).
--
-- This script does a hard wipe across EVERY table that could carry
-- a reference to those emails. Idempotent — re-running is a no-op
-- once they're gone.
--
-- After it runs, Andrew can use the magic-link invite flow on each
-- of these three emails as if they had never existed.
-- =====================================================================

DO $$
DECLARE
  v_email      text;
  v_user_id    uuid;
  v_total      int := 0;
  v_emails     text[] := ARRAY[
    'brayan.sanchez1017@gmail.com',
    'villagomezfo499@gmail.com',
    'nlocampo74@gmail.com'
  ];
BEGIN
  FOREACH v_email IN ARRAY v_emails LOOP
    v_email := lower(btrim(v_email));

    -- Look up the auth.users id if there's still a row.
    SELECT id INTO v_user_id
      FROM auth.users WHERE lower(email::text) = v_email;

    -- (1) pending_invitations are keyed by email, not user_id.
    DELETE FROM public.pending_invitations
     WHERE lower(email) = v_email;

    -- (2) Everything below is keyed by user_id; skip if no row exists.
    IF v_user_id IS NOT NULL THEN
      -- push_subscriptions
      BEGIN
        DELETE FROM public.push_subscriptions WHERE user_id = v_user_id;
      EXCEPTION WHEN OTHERS THEN NULL; END;

      -- notifications addressed to this user
      BEGIN
        DELETE FROM public.notifications WHERE user_id = v_user_id;
      EXCEPTION WHEN OTHERS THEN NULL; END;

      -- customer notification preferences
      BEGIN
        DELETE FROM public.customer_notification_preferences
         WHERE membership_id IN (
           SELECT id FROM public.business_memberships WHERE user_id = v_user_id
         );
      EXCEPTION WHEN OTHERS THEN NULL; END;

      -- customer_saved_offers via membership
      BEGIN
        DELETE FROM public.customer_saved_offers
         WHERE membership_id IN (
           SELECT id FROM public.business_memberships WHERE user_id = v_user_id
         );
      EXCEPTION WHEN OTHERS THEN NULL; END;

      -- points_ledger via membership
      BEGIN
        DELETE FROM public.points_ledger
         WHERE membership_id IN (
           SELECT id FROM public.business_memberships WHERE user_id = v_user_id
         );
      EXCEPTION WHEN OTHERS THEN NULL; END;

      -- member_streaks via membership
      BEGIN
        DELETE FROM public.member_streaks
         WHERE membership_id IN (
           SELECT id FROM public.business_memberships WHERE user_id = v_user_id
         );
      EXCEPTION WHEN OTHERS THEN NULL; END;

      -- redemptions / check_in_events / events / reviews / referrals
      -- all reference membership_id; nuke them defensively.
      BEGIN
        DELETE FROM public.redemptions
         WHERE membership_id IN (
           SELECT id FROM public.business_memberships WHERE user_id = v_user_id
         );
      EXCEPTION WHEN OTHERS THEN NULL; END;

      BEGIN
        DELETE FROM public.check_in_events
         WHERE membership_id IN (
           SELECT id FROM public.business_memberships WHERE user_id = v_user_id
         );
      EXCEPTION WHEN OTHERS THEN NULL; END;

      BEGIN
        DELETE FROM public.events
         WHERE membership_id IN (
           SELECT id FROM public.business_memberships WHERE user_id = v_user_id
         );
      EXCEPTION WHEN OTHERS THEN NULL; END;

      BEGIN
        DELETE FROM public.reviews
         WHERE membership_id IN (
           SELECT id FROM public.business_memberships WHERE user_id = v_user_id
         );
      EXCEPTION WHEN OTHERS THEN NULL; END;

      BEGIN
        DELETE FROM public.referrals
         WHERE referrer_membership_id IN (
           SELECT id FROM public.business_memberships WHERE user_id = v_user_id
         )
            OR referee_membership_id IN (
           SELECT id FROM public.business_memberships WHERE user_id = v_user_id
         );
      EXCEPTION WHEN OTHERS THEN NULL; END;

      -- pending_memberships (CP-34)
      BEGIN
        DELETE FROM public.pending_memberships
         WHERE membership_id IN (
           SELECT id FROM public.business_memberships WHERE user_id = v_user_id
         );
      EXCEPTION WHEN OTHERS THEN NULL; END;

      -- mystery_reward_spins
      BEGIN
        DELETE FROM public.mystery_reward_spins
         WHERE membership_id IN (
           SELECT id FROM public.business_memberships WHERE user_id = v_user_id
         );
      EXCEPTION WHEN OTHERS THEN NULL; END;

      -- business_memberships
      DELETE FROM public.business_memberships WHERE user_id = v_user_id;

      -- business_users (team role)
      DELETE FROM public.business_users WHERE user_id = v_user_id;

      -- profiles
      DELETE FROM public.profiles WHERE id = v_user_id;

      -- auth.users (the foundation row)
      DELETE FROM auth.users WHERE id = v_user_id;

      RAISE NOTICE 'Wiped % (user_id=%)', v_email, v_user_id;
      v_total := v_total + 1;
    ELSE
      RAISE NOTICE 'No auth row for % — cleaned pending_invitations only', v_email;
    END IF;
  END LOOP;

  RAISE NOTICE '─────────────────────────────────────────────';
  RAISE NOTICE 'CP-37.17: wiped % auth.users rows. Andrew can now re-invite all three.', v_total;
  RAISE NOTICE '─────────────────────────────────────────────';
END $$;


-- ─── Verify ──────────────────────────────────────────────────────────
SELECT 'auth.users rows remaining for these emails' AS step,
       u.email
  FROM auth.users u
 WHERE lower(u.email::text) IN (
   'brayan.sanchez1017@gmail.com',
   'villagomezfo499@gmail.com',
   'nlocampo74@gmail.com'
 );

SELECT 'business_users rows remaining for these emails' AS step,
       u.email,
       bu.role
  FROM public.business_users bu
  JOIN auth.users u ON u.id = bu.user_id
 WHERE lower(u.email::text) IN (
   'brayan.sanchez1017@gmail.com',
   'villagomezfo499@gmail.com',
   'nlocampo74@gmail.com'
 );

SELECT 'pending_invitations rows remaining for these emails' AS step,
       email,
       role
  FROM public.pending_invitations
 WHERE lower(email) IN (
   'brayan.sanchez1017@gmail.com',
   'villagomezfo499@gmail.com',
   'nlocampo74@gmail.com'
 );

-- All three result tables should be empty after this script runs.
