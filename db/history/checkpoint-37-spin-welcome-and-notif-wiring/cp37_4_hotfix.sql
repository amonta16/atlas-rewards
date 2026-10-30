-- =====================================================================
-- CP-37.4 hotfix — review-funnel drop + missing manager-or-admin helper
-- =====================================================================
-- Two errors Andrew hit while applying cp37_3_hotfix:
--
--   1) "cannot change return type of existing function" on
--      atlas_review_funnel. CP-32 created it with `int` counts; the
--      CP-37.3 version returned `bigint` (the correct types from
--      count(*)). Postgres refuses CREATE OR REPLACE across a return-
--      shape change. Fix: DROP first, then CREATE.
--
--   2) "function public.is_business_manager_or_admin(uuid) does not
--      exist" — referenced inside cp37_2's send_test_notification.
--      The function was never actually defined; broadcast_notification
--      inlined the same check, but I copied a "should-exist" name.
--      Fix: create the helper as a thin wrapper around the inlined
--      check broadcast_notification already uses, AND re-create
--      send_test_notification so the search-path picks up the new
--      function definition.
-- =====================================================================


-- ---------------------------------------------------------------------
-- (1) Re-run the review-funnel rewrite with a DROP first.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.atlas_review_funnel(uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.atlas_review_funnel(p_business_id uuid)
RETURNS TABLE (
  asks_30d           bigint,
  submitted_30d      bigint,
  verified_30d       bigint,
  star_avg_before    numeric,
  star_avg_after     numeric,
  reviews_lifetime   bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_first_review_at timestamptz;
BEGIN
  SELECT min(verified_at) INTO v_first_review_at
    FROM public.reviews
   WHERE business_id = p_business_id AND status = 'verified';

  RETURN QUERY
    SELECT
      (SELECT count(*)::bigint
         FROM public.business_memberships
        WHERE business_id = p_business_id
          AND joined_at >= now() - interval '30 days'),
      (SELECT count(*)::bigint FROM public.reviews
        WHERE business_id = p_business_id
          AND submitted_at >= now() - interval '30 days'),
      (SELECT count(*)::bigint FROM public.reviews
        WHERE business_id = p_business_id AND status = 'verified'
          AND coalesce(verified_at, submitted_at) >= now() - interval '30 days'),
      -- NO fallback. NULL → UI hides the Before/Now panel.
      (SELECT avg((verification_data->>'rating')::numeric)
         FROM public.reviews
        WHERE business_id = p_business_id
          AND status = 'verified'
          AND v_first_review_at IS NOT NULL
          AND verified_at < v_first_review_at + interval '30 days'),
      (SELECT avg((verification_data->>'rating')::numeric)
         FROM public.reviews
        WHERE business_id = p_business_id
          AND status = 'verified'
          AND verified_at >= now() - interval '30 days'),
      (SELECT count(*)::bigint FROM public.reviews
        WHERE business_id = p_business_id AND status = 'verified');
END; $$;

GRANT EXECUTE ON FUNCTION public.atlas_review_funnel(uuid) TO authenticated;


-- ---------------------------------------------------------------------
-- (2) is_business_manager_or_admin helper + send_test_notification fix
-- ---------------------------------------------------------------------
-- Inline check broadcast_notification was already using:
--   is_agency_admin() OR business_users.role = 'business_manager' on this business.
-- Wrap it once so future RPCs can call a named helper.
--
-- agency_admin row in business_users has business_id IS NULL — we
-- check both shapes (is_agency_admin() helper + the row check) so
-- this also works for deploys where is_agency_admin isn't installed.

CREATE OR REPLACE FUNCTION public.is_business_manager_or_admin(p_business_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;

  -- Agency admin (business_id IS NULL or matches).
  IF EXISTS (
    SELECT 1 FROM public.business_users
     WHERE user_id = v_uid
       AND role = 'agency_admin'
       AND (business_id IS NULL OR business_id = p_business_id)
  ) THEN RETURN true; END IF;

  -- Business manager for THIS business.
  IF EXISTS (
    SELECT 1 FROM public.business_users
     WHERE user_id = v_uid
       AND business_id = p_business_id
       AND role = 'business_manager'
  ) THEN RETURN true; END IF;

  RETURN false;
END; $$;

GRANT EXECUTE ON FUNCTION public.is_business_manager_or_admin(uuid) TO authenticated;


-- Re-create send_test_notification so search-path resolution picks up
-- the new helper. (Necessary because CREATE OR REPLACE doesn't reload
-- dependent-function name resolution on its own in all Postgres
-- versions.) Drop-and-recreate is safe — function body is unchanged
-- from cp37_2 other than this rewrite.
DROP FUNCTION IF EXISTS public.send_test_notification(uuid, text);

CREATE OR REPLACE FUNCTION public.send_test_notification(
  p_business_id uuid,
  p_kind        text DEFAULT NULL
)
RETURNS TABLE (sent int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_sent int  := 0;
  v_settings record;
  v_kinds text[];
  k text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT public.is_business_manager_or_admin(p_business_id) THEN
    RAISE EXCEPTION 'permission denied — must be manager or agency admin';
  END IF;

  IF p_kind IS NOT NULL THEN
    v_kinds := ARRAY[p_kind];
  ELSE
    SELECT * INTO v_settings
      FROM public.business_notification_settings
     WHERE business_id = p_business_id;

    v_kinds := ARRAY[]::text[];
    IF COALESCE(v_settings.streak_reminders, true)             THEN v_kinds := v_kinds || 'streak_reminders'; END IF;
    IF COALESCE(v_settings.gift_expiration_reminders, true)    THEN v_kinds := v_kinds || 'gift_expiration_reminders'; END IF;
    IF COALESCE(v_settings.customer_offer_announcements, true) THEN v_kinds := v_kinds || 'customer_offer_announcements'; END IF;
    IF COALESCE(v_settings.check_in_available, true)           THEN v_kinds := v_kinds || 'check_in_available'; END IF;
    IF COALESCE(v_settings.we_miss_you, true)                  THEN v_kinds := v_kinds || 'we_miss_you'; END IF;
    IF COALESCE(v_settings.reward_unlocked, true)              THEN v_kinds := v_kinds || 'reward_unlocked'; END IF;
    IF COALESCE(v_settings.birthday, true)                     THEN v_kinds := v_kinds || 'birthday'; END IF;
    IF COALESCE(v_settings.review_request, true)               THEN v_kinds := v_kinds || 'review_request'; END IF;
  END IF;

  FOREACH k IN ARRAY v_kinds LOOP
    INSERT INTO public.notifications (user_id, business_id, kind, title, body, link_path)
    VALUES (
      v_user,
      p_business_id,
      CASE k
        WHEN 'streak_reminders'             THEN 'streak'
        WHEN 'gift_expiration_reminders'    THEN 'reward_expiration'
        WHEN 'customer_offer_announcements' THEN 'customer_offer'
        WHEN 'check_in_available'           THEN 'check_in_available'
        WHEN 'we_miss_you'                  THEN 'we_miss_you'
        WHEN 'reward_unlocked'              THEN 'reward_unlocked'
        WHEN 'birthday'                     THEN 'birthday'
        WHEN 'review_request'               THEN 'review_request'
        ELSE 'generic'
      END,
      '🧪 Test · ' || CASE k
        WHEN 'streak_reminders'             THEN 'Streak reminder'
        WHEN 'gift_expiration_reminders'    THEN 'Gift expiring'
        WHEN 'customer_offer_announcements' THEN 'Customer offer announcement'
        WHEN 'check_in_available'           THEN 'Check-in available'
        WHEN 'we_miss_you'                  THEN 'We miss you'
        WHEN 'reward_unlocked'              THEN 'Reward unlocked'
        WHEN 'birthday'                     THEN 'Birthday bonus'
        WHEN 'review_request'               THEN 'Review request'
        ELSE 'Test notification'
      END,
      'This is a test fired from agency settings — wire is working.',
      '/app'
    );
    v_sent := v_sent + 1;
  END LOOP;

  sent := v_sent;
  RETURN NEXT;
END; $$;

GRANT EXECUTE ON FUNCTION public.send_test_notification(uuid, text) TO authenticated;


-- ---------------------------------------------------------------------
-- (3) Re-run the stuck-invitee backfill in case CP-37.3 errored out
-- before getting to this block. Idempotent — no-op on already-confirmed.
-- ---------------------------------------------------------------------
DO $$
DECLARE v_rescued int := 0;
BEGIN
  UPDATE auth.users u
     SET email_confirmed_at = COALESCE(u.email_confirmed_at, now())
   WHERE u.email_confirmed_at IS NULL
     AND EXISTS (
       SELECT 1 FROM public.pending_invitations pi
        WHERE lower(pi.email) = lower(u.email::text)
     );
  GET DIAGNOSTICS v_rescued = ROW_COUNT;
  RAISE NOTICE 'CP-37.4 backfill: confirmed % stuck invitee accounts.', v_rescued;
END $$;


NOTIFY pgrst, 'reload schema';
