-- =====================================================================
-- CP-42 — accept_invitation business_id ambiguity hotfix
-- =====================================================================
-- The original CP-31 accept_invitation declared:
--
--   RETURNS TABLE (ok boolean, role text, business_id uuid)
--
-- Inside the function body it then ran:
--
--   INSERT INTO public.business_users (user_id, business_id, role) ...
--   ON CONFLICT (user_id, business_id, role) DO NOTHING;
--
-- PostgreSQL's plpgsql parser cannot decide whether `business_id` in
-- the ON CONFLICT column list refers to the RETURNS TABLE column or
-- the business_users table column. The result is a runtime error:
--
--   ERROR: column reference "business_id" is ambiguous
--
-- This is the same class of bug CP-40 fixed for create_invitation (the
-- "token" ambiguity). Fix here: rename the RETURNS TABLE column to
-- `out_business_id` so there's no collision. The route handler reads
-- the field by name and is updated in lock-step.
--
-- Self-contained, idempotent. Apply after cp31.
-- =====================================================================

DROP FUNCTION IF EXISTS public.accept_invitation(uuid);

CREATE FUNCTION public.accept_invitation(p_token uuid)
RETURNS TABLE (
  ok               boolean,
  out_role         text,
  out_business_id  uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_email  text;
  v_inv    record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT lower(email) INTO v_email FROM auth.users WHERE id = v_uid;

  SELECT *
    INTO v_inv
    FROM public.pending_invitations
   WHERE token = p_token
   FOR UPDATE;

  IF v_inv.id IS NULL THEN
    RAISE EXCEPTION 'invitation not found';
  END IF;
  IF v_inv.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'invitation revoked';
  END IF;
  IF v_inv.expires_at < now() THEN
    RAISE EXCEPTION 'invitation expired';
  END IF;
  IF lower(v_inv.email) <> v_email THEN
    RAISE EXCEPTION 'invitation email does not match signed-in user';
  END IF;

  IF v_inv.accepted_at IS NOT NULL THEN
    IF v_inv.accepted_by = v_uid THEN
      RETURN QUERY SELECT true, v_inv.role::text, v_inv.business_id;
      RETURN;
    END IF;
    RAISE EXCEPTION 'invitation already accepted by another account';
  END IF;

  -- Claim the invite + create the role row in one transaction.
  -- The ON CONFLICT below previously crashed because `business_id`
  -- collided with the RETURNS TABLE column of the same name.
  INSERT INTO public.business_users AS bu (user_id, business_id, role)
  VALUES (v_uid, v_inv.business_id, v_inv.role)
  ON CONFLICT (user_id, business_id, role) DO NOTHING;

  UPDATE public.pending_invitations
     SET accepted_at = now(),
         accepted_by = v_uid
   WHERE id = v_inv.id;

  RETURN QUERY SELECT true, v_inv.role::text, v_inv.business_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_invitation(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
