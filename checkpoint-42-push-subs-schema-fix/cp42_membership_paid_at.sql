-- =====================================================================
-- CP-42 — Track membership paid date so we can show renewal due date
-- =====================================================================
-- Add a `membership_paid_at` column so customers see WHEN their
-- membership started and we can compute the next renewal date.
--
-- Self-contained, idempotent. Apply after cp34.
-- =====================================================================

ALTER TABLE public.business_memberships
  ADD COLUMN IF NOT EXISTS membership_paid_at timestamptz;

-- Backfill: any membership already marked 'paid' gets the row's updated_at
UPDATE public.business_memberships
   SET membership_paid_at = updated_at
 WHERE membership_payment_status = 'paid'
   AND membership_paid_at IS NULL;

-- Update activate_pending_membership to set membership_paid_at = now()
CREATE OR REPLACE FUNCTION public.activate_pending_membership(
  p_membership_id uuid,
  p_note          text DEFAULT NULL
)
RETURNS TABLE (membership_id uuid, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_business uuid;
BEGIN
  SELECT bm.business_id INTO v_business
    FROM public.business_memberships bm
   WHERE bm.id = p_membership_id;

  IF v_business IS NULL THEN RAISE EXCEPTION 'membership not found'; END IF;
  IF NOT public.staffs_business(v_business) THEN
    RAISE EXCEPTION 'permission denied — staff only';
  END IF;

  UPDATE public.business_memberships
     SET status                    = 'active',
         membership_payment_status = 'paid',
         membership_paid_at        = now(),  -- CP-42: track when membership started
         updated_at                = now()
   WHERE id = p_membership_id;

  -- Surface a notification to the customer that they're in.
  INSERT INTO public.notifications (user_id, business_id, kind, title, body, link_path)
  SELECT m.user_id, m.business_id, 'generic',
         'You''re a member! 🎉',
         COALESCE(p_note,
           'Your membership is active. Tap to see your perks.'),
         '/app'
    FROM public.business_memberships m
   WHERE m.id = p_membership_id;

  RETURN QUERY SELECT p_membership_id, 'active'::text;
END; $$;

GRANT EXECUTE ON FUNCTION public.activate_pending_membership(uuid, text) TO authenticated;

-- A small RPC for the customer app: returns their paid-membership status
-- (if any) plus the computed renewal date (paid_at + 30 days, rolling).
CREATE OR REPLACE FUNCTION public.member_membership_status(p_business_id uuid)
RETURNS TABLE (
  is_paid          boolean,
  paid_at          timestamptz,
  renewal_due_at   timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user    uuid := auth.uid();
  v_paid    boolean := false;
  v_paid_at timestamptz;
  v_renews  timestamptz;
  v_days    int;
BEGIN
  IF v_user IS NULL THEN
    RETURN QUERY SELECT false, NULL::timestamptz, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT (bm.membership_payment_status = 'paid'),
         bm.membership_paid_at
    INTO v_paid, v_paid_at
    FROM public.business_memberships bm
   WHERE bm.business_id = p_business_id
     AND bm.user_id     = v_user
   LIMIT 1;

  IF v_paid_at IS NOT NULL THEN
    -- Rolling 30-day renewal: days since paid_at, round up to next 30-day boundary.
    v_days  := GREATEST(0, EXTRACT(epoch FROM (now() - v_paid_at))::int / 86400);
    v_renews := v_paid_at + ((v_days / 30 + 1) * 30 || ' days')::interval;
  END IF;

  RETURN QUERY SELECT COALESCE(v_paid, false), v_paid_at, v_renews;
END; $$;

GRANT EXECUTE ON FUNCTION public.member_membership_status(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
