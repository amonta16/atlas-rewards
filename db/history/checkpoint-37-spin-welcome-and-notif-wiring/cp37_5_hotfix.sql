-- =====================================================================
-- CP-37.5 hotfix — test notification fanout
-- =====================================================================
-- Andrew's report: "Send to all members" works (members see push), but
-- the "Test notifications" buttons say "sent" yet nothing surfaces.
--
-- Root cause: CP-37.2's send_test_notification inserted a row with
-- user_id = caller (the agency admin). The admin doesn't have a
-- business_memberships row in the test sub-account, so:
--   • the customer bell on /<slug>/app doesn't show the row (admin
--     can't even open that surface as a customer)
--   • the universal push fanout posts to /api/notifications/push-fanout
--     but there's no push_subscription for the admin on this business
--
-- Net effect: notifications exist in the database but nobody can see
-- them. From Andrew's POV the buttons are silently broken.
--
-- Fix: target ALL enrolled members of the business — same recipient
-- set as broadcast_notification — with a "🧪 Test" prefix on the title.
-- That way the wiring matches the production "Send to all members"
-- path exactly, and any test customer account Andrew has enrolled
-- will receive both an in-app bell row AND a push to their device.
-- =====================================================================

DROP FUNCTION IF EXISTS public.send_test_notification(uuid, text);

CREATE OR REPLACE FUNCTION public.send_test_notification(
  p_business_id uuid,
  p_kind        text DEFAULT NULL
)
RETURNS TABLE (sent int, recipients int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_inserted int := 0;
  v_recipients int := 0;
  v_settings record;
  v_kinds text[];
  k text;
  v_kind_value text;
  v_title text;
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

  -- Count enrolled members in this business once — same as the
  -- recipient set broadcast_notification uses for the "Send to all"
  -- composer.
  SELECT count(*) INTO v_recipients
    FROM public.business_memberships
   WHERE business_id = p_business_id;

  -- For each requested kind, insert one notification row per member.
  -- The CP-42 universal push-fanout trigger will deliver pushes per
  -- the customer's prefs, identical to the production path.
  FOREACH k IN ARRAY v_kinds LOOP
    v_kind_value := CASE k
      WHEN 'streak_reminders'             THEN 'streak'
      WHEN 'gift_expiration_reminders'    THEN 'reward_expiration'
      WHEN 'customer_offer_announcements' THEN 'customer_offer'
      WHEN 'check_in_available'           THEN 'check_in_available'
      WHEN 'we_miss_you'                  THEN 'we_miss_you'
      WHEN 'reward_unlocked'              THEN 'reward_unlocked'
      WHEN 'birthday'                     THEN 'birthday'
      WHEN 'review_request'               THEN 'review_request'
      ELSE 'generic'
    END;
    v_title := '🧪 Test · ' || CASE k
      WHEN 'streak_reminders'             THEN 'Streak reminder'
      WHEN 'gift_expiration_reminders'    THEN 'Gift expiring'
      WHEN 'customer_offer_announcements' THEN 'Customer offer announcement'
      WHEN 'check_in_available'           THEN 'Check-in available'
      WHEN 'we_miss_you'                  THEN 'We miss you'
      WHEN 'reward_unlocked'              THEN 'Reward unlocked'
      WHEN 'birthday'                     THEN 'Birthday bonus'
      WHEN 'review_request'               THEN 'Review request'
      ELSE 'Test notification'
    END;

    INSERT INTO public.notifications (user_id, business_id, kind, title, body, link_path)
    SELECT m.user_id, p_business_id, v_kind_value, v_title,
           'Test from agency settings — if you saw this, the wire works.',
           '/app'
      FROM public.business_memberships m
     WHERE m.business_id = p_business_id;

    v_inserted := v_inserted + v_recipients;
  END LOOP;

  sent       := v_inserted;
  recipients := v_recipients;
  RETURN NEXT;
END; $$;

GRANT EXECUTE ON FUNCTION public.send_test_notification(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
