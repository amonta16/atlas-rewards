-- =====================================================================
-- CP-37.11 — insert_test_notification_rows helper
-- =====================================================================
-- Backs the new /api/notifications/test endpoint. Inserts a
-- notifications row for every member of the business (the bell-badge
-- side of the test). The route handler then directly calls
-- sendPushToBusiness — same proven path the "Send to all" composer
-- uses — to deliver phone pushes, bypassing the pg_net trigger that
-- was silently failing in production.
--
-- Permission: manager or agency-admin of the business. SECURITY
-- DEFINER + explicit gate inside the function.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.insert_test_notification_rows(
  p_business_id uuid,
  p_kind        text,
  p_title       text,
  p_body        text
)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n int := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT public.is_business_manager_or_admin(p_business_id) THEN
    RAISE EXCEPTION 'permission denied — must be manager or agency admin';
  END IF;

  INSERT INTO public.notifications (user_id, business_id, kind, title, body, link_path)
  SELECT m.user_id, p_business_id, p_kind, p_title, p_body, '/app'
    FROM public.business_memberships m
   WHERE m.business_id = p_business_id;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END; $$;

GRANT EXECUTE ON FUNCTION public.insert_test_notification_rows(uuid, text, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
