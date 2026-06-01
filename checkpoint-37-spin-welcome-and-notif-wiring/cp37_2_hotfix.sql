-- =====================================================================
-- CP-37.2 hotfix — test notifications + member history + login rescue
-- =====================================================================
-- New RPCs:
--   1) send_test_notification(business_id, kind?) — fires a sample
--      notification of every enabled kind (or one specific kind) to
--      the caller. Used by the agency "Test notifications" panel so
--      Andrew can verify the in-app + push pipe works without having
--      to manufacture a real points-crossing event.
--
--   2) member_history_for_staff(business_id, membership_id) — returns
--      a member's points, tier, lifetime, visits, referrals, pending-
--      membership state, and the last 10 ledger rows. Backs the new
--      MemberHistoryPanel on the front-desk award screen.
--
-- Both are SECURITY DEFINER with staff-only RLS-style permission
-- checks. Safe to re-run.
-- =====================================================================


-- ---------------------------------------------------------------------
-- (1) send_test_notification(business_id, kind)
-- ---------------------------------------------------------------------
-- Permission: caller must be manager or agency-admin of the business
-- (same gate as broadcast_notification). Inserts notifications rows
-- targeting the caller's user_id; the universal push-fanout trigger
-- handles delivery to the device.
--
-- kind=NULL → fires one notification of EACH enabled kind so Andrew
--             can verify all toggles end-to-end in one tap.
-- kind=<x>  → fires just that one kind, even if the master switch is
--             off (test override).
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

  -- Decide which kinds to fire.
  IF p_kind IS NOT NULL THEN
    v_kinds := ARRAY[p_kind];
  ELSE
    -- Read the business's master switches; only fire kinds that are ON.
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
      -- The settings keys differ slightly from notifications.kind values.
      -- Map back to the constraint-allowed kinds.
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
-- (2) member_history_for_staff(business_id, membership_id)
-- ---------------------------------------------------------------------
-- Returns a single row with the member's profile-shaped stats + a
-- JSONB array of the last 10 ledger entries. Used by the front-desk
-- MemberHistoryPanel after a QR / code lookup.

DROP FUNCTION IF EXISTS public.member_history_for_staff(uuid, uuid);

CREATE OR REPLACE FUNCTION public.member_history_for_staff(
  p_business_id   uuid,
  p_membership_id uuid
)
RETURNS TABLE (
  membership_state          text,
  points_balance            int,
  tier                      text,
  lifetime_points_earned    int,
  joined_at                 timestamptz,
  last_visit_at             timestamptz,
  visit_count               int,
  referrals_brought         int,
  pending_membership_active boolean,
  pending_membership_kind   text,
  ledger                    jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF NOT public.staffs_business(p_business_id) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  SELECT m.user_id INTO v_user_id
    FROM public.business_memberships m
   WHERE m.id = p_membership_id AND m.business_id = p_business_id;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'member not found';
  END IF;

  -- Core membership stats.
  SELECT COALESCE(m.status, 'active'),
         m.points_balance,
         m.tier,
         m.lifetime_points_earned,
         m.joined_at,
         m.last_visit_at,
         m.visit_count
    INTO membership_state, points_balance, tier, lifetime_points_earned,
         joined_at, last_visit_at, visit_count
    FROM public.business_memberships m
   WHERE m.id = p_membership_id;

  -- Referrals brought (joined this business via referral attribution).
  -- Defensive: tolerate missing referrals table on older deploys.
  BEGIN
    SELECT COUNT(*)::int INTO referrals_brought
      FROM public.referrals r
     WHERE r.referrer_membership_id = p_membership_id
       AND r.business_id = p_business_id;
  EXCEPTION WHEN undefined_table THEN
    referrals_brought := 0;
  WHEN OTHERS THEN
    referrals_brought := 0;
  END;

  -- Pending membership activation.
  BEGIN
    SELECT EXISTS(
      SELECT 1 FROM public.pending_memberships pm
       WHERE pm.membership_id = p_membership_id
         AND pm.status = 'pending'
    ),
    (SELECT pm.payment_mode FROM public.pending_memberships pm
      WHERE pm.membership_id = p_membership_id AND pm.status = 'pending'
      ORDER BY pm.created_at DESC LIMIT 1)
    INTO pending_membership_active, pending_membership_kind;
  EXCEPTION WHEN undefined_table THEN
    pending_membership_active := false;
    pending_membership_kind   := NULL;
  WHEN OTHERS THEN
    pending_membership_active := false;
    pending_membership_kind   := NULL;
  END;

  -- Last 10 ledger entries.
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id',         l.id,
        'delta',      l.delta,
        'rule_type',  l.rule_type,
        'notes',      l.notes,
        'created_at', l.created_at
      ) ORDER BY l.created_at DESC
    ),
    '[]'::jsonb
  ) INTO ledger
  FROM (
    SELECT id, delta, rule_type, notes, created_at
      FROM public.points_ledger
     WHERE membership_id = p_membership_id
     ORDER BY created_at DESC
     LIMIT 10
  ) l;

  RETURN NEXT;
END; $$;

GRANT EXECUTE ON FUNCTION public.member_history_for_staff(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
