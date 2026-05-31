-- =====================================================================
-- CP-42 — request_membership: idempotent on existing pending
-- =====================================================================
-- Andrew caught this: the customer Join modal lets them tap "Apply"
-- a second time even after they're already pending. The current
-- request_membership RPC re-stamps status='pending' each call, so
-- the front desk sees the same row bounce around without any signal
-- that the customer is re-clicking.
--
-- Fix: short-circuit if the membership is already paid/active or
-- already pending. Return the existing state instead of mutating.
-- The client uses this to surface the right UI without ever needing
-- to call this twice for the same person.
--
-- Also adds a small read RPC the customer Join modal can call to
-- check their CURRENT payment_status before showing the Apply CTA.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.request_membership(p_business_id uuid)
RETURNS TABLE (status text, payment_mode text, payment_url text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_mode    text;
  v_url     text;
  v_user    uuid := auth.uid();
  v_mem_id  uuid;
  v_status  text;
  v_pay     text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT b.payment_mode, b.external_payment_url
    INTO v_mode, v_url
    FROM public.business_membership_billing b
   WHERE b.business_id = p_business_id;

  IF v_mode IS NULL THEN
    RAISE EXCEPTION 'membership billing not configured for this business';
  END IF;
  IF v_mode = 'stripe' THEN
    RAISE EXCEPTION 'this business is configured for Stripe — use /api/<slug>/membership/checkout instead';
  END IF;

  -- CP-42: read the CURRENT membership state. If already pending or
  -- paid, return without mutating — caller's UI shows the right
  -- pending / member state without firing again.
  SELECT m.id, m.status, m.membership_payment_status
    INTO v_mem_id, v_status, v_pay
    FROM public.business_memberships m
   WHERE m.business_id = p_business_id AND m.user_id = v_user;

  IF v_mem_id IS NOT NULL AND v_pay IN ('pending', 'paid') THEN
    RETURN QUERY SELECT v_pay::text, v_mode, v_url;
    RETURN;
  END IF;

  IF v_mem_id IS NULL THEN
    INSERT INTO public.business_memberships
      (business_id, user_id, status, membership_payment_status)
    VALUES
      (p_business_id, v_user, 'pending', 'pending')
    RETURNING id INTO v_mem_id;
  ELSE
    UPDATE public.business_memberships
       SET status                    = 'pending',
           membership_payment_status = 'pending'
     WHERE id = v_mem_id;
  END IF;

  RETURN QUERY SELECT 'pending'::text, v_mode, v_url;
END; $$;

GRANT EXECUTE ON FUNCTION public.request_membership(uuid) TO authenticated;


-- Tiny read-only helper for the Join modal to fetch current state
-- WITHOUT mutating anything. Returns null if no membership row exists.
CREATE OR REPLACE FUNCTION public.my_membership_payment_state(p_business_id uuid)
RETURNS TABLE (
  has_row        boolean,
  membership_id  uuid,
  status         text,
  payment_status text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_id   uuid;
  v_s    text;
  v_p    text;
BEGIN
  IF v_user IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, NULL::text;
    RETURN;
  END IF;

  SELECT m.id, m.status, m.membership_payment_status
    INTO v_id, v_s, v_p
    FROM public.business_memberships m
   WHERE m.business_id = p_business_id AND m.user_id = v_user;

  RETURN QUERY SELECT v_id IS NOT NULL, v_id, v_s, v_p;
END; $$;

GRANT EXECUTE ON FUNCTION public.my_membership_payment_state(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
