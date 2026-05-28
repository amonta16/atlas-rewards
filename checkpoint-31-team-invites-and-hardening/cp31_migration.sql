-- ─────────────────────────────────────────────────────────────────────────────
-- CP-31 — Team invites + role-gated account creation
-- ─────────────────────────────────────────────────────────────────────────────
-- Self-contained. Idempotent. Safe to re-run.
--
-- What this migration adds:
--   1) pending_invitations table — one row per outstanding invite.
--   2) create_invitation(email, role, business_id) — role-gated by caller.
--      Returns the token the API route uses as the magic-link landing param.
--   3) accept_invitation(token) — claims an invite, creates the
--      business_users row, atomically. Idempotent on re-call.
--   4) revoke_invitation(token) — marks an outstanding invite as
--      revoked (without deleting the row, so the audit trail stays).
--   5) list_team_members(p_business_id) — returns current members +
--      pending invitations for the agency / manager team page. Filter
--      by null business_id to get agency-wide.
--
-- Permissions:
--   agency_admin   → can invite any role for any business (or null
--                    business_id for assistant-admins).
--   business_manager → can invite business_staff for THEIR business
--                    only. Cannot invite managers or admins.
--   business_staff → no invite power.
--
-- Invites expire after 14 days by default.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1) pending_invitations table ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pending_invitations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email        text NOT NULL,
  business_id  uuid REFERENCES public.businesses(id) ON DELETE CASCADE,
  -- business_id is NULL for agency_admin invites (cross-business).
  role         text NOT NULL CHECK (role IN ('agency_admin','business_manager','business_staff')),
  token        uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  invited_by   uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at   timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_at  timestamptz,
  accepted_by  uuid REFERENCES auth.users(id),
  revoked_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),

  -- Email + business + role must be unique among OPEN invitations so we
  -- don't end up with two outstanding invites for the same person/role.
  -- Closed (accepted or revoked) invites can repeat.
  CONSTRAINT one_open_invite_per_target
    EXCLUDE USING btree (email WITH =, business_id WITH =, role WITH =)
    WHERE (accepted_at IS NULL AND revoked_at IS NULL)
);

-- gen_random_uuid lives in pgcrypto on older Postgres versions. Safe no-op
-- when the extension is already loaded.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- btree_gist is needed for the EXCLUDE constraint above on equality columns.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE INDEX IF NOT EXISTS pending_invitations_email_idx
  ON public.pending_invitations (lower(email));
CREATE INDEX IF NOT EXISTS pending_invitations_business_idx
  ON public.pending_invitations (business_id);

ALTER TABLE public.pending_invitations ENABLE ROW LEVEL SECURITY;

-- RLS: agency_admins see everything. Managers see invites for their business.
-- Staff see nothing.
DROP POLICY IF EXISTS "invitations_admin_all"   ON public.pending_invitations;
DROP POLICY IF EXISTS "invitations_manager_read" ON public.pending_invitations;

CREATE POLICY "invitations_admin_all"
  ON public.pending_invitations FOR ALL TO authenticated
  USING      (public.is_agency_admin())
  WITH CHECK (public.is_agency_admin());

CREATE POLICY "invitations_manager_read"
  ON public.pending_invitations FOR SELECT TO authenticated
  USING (
    business_id IS NOT NULL
    AND public.is_business_manager(business_id)
  );

-- ── 2) create_invitation ───────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.create_invitation(text, text, uuid);

CREATE OR REPLACE FUNCTION public.create_invitation(
  p_email       text,
  p_role        text,
  p_business_id uuid DEFAULT NULL
)
RETURNS TABLE (
  invitation_id uuid,
  token         uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email      text := lower(btrim(p_email));
  v_id         uuid;
  v_tok        uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF v_email IS NULL OR v_email = '' OR position('@' in v_email) = 0 THEN
    RAISE EXCEPTION 'invalid email';
  END IF;
  IF p_role NOT IN ('agency_admin','business_manager','business_staff') THEN
    RAISE EXCEPTION 'invalid role';
  END IF;

  -- Permission check
  IF p_role = 'agency_admin' THEN
    IF NOT public.is_agency_admin() THEN
      RAISE EXCEPTION 'only agency_admin can invite agency_admin';
    END IF;
    -- agency_admin invites have business_id = NULL
    IF p_business_id IS NOT NULL THEN
      RAISE EXCEPTION 'agency_admin invites must have business_id = NULL';
    END IF;
  ELSE
    -- business_manager or business_staff — must target a specific business
    IF p_business_id IS NULL THEN
      RAISE EXCEPTION 'business_id required for role %', p_role;
    END IF;
    -- agency_admin can invite anyone anywhere
    -- business_manager can only invite business_staff for their own business
    IF NOT (
      public.is_agency_admin()
      OR (p_role = 'business_staff'
          AND public.is_business_manager(p_business_id))
    ) THEN
      RAISE EXCEPTION 'permission denied for invite of role % to business %', p_role, p_business_id;
    END IF;
  END IF;

  -- Insert. The EXCLUDE constraint prevents duplicate-open invites for the
  -- same (email, business_id, role) triple.
  INSERT INTO public.pending_invitations
    (email, business_id, role, invited_by)
  VALUES
    (v_email, p_business_id, p_role, auth.uid())
  RETURNING id, token INTO v_id, v_tok;

  RETURN QUERY SELECT v_id, v_tok;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_invitation(text, text, uuid) TO authenticated;

-- ── 3) accept_invitation ───────────────────────────────────────────────────
-- Run after the invitee has authenticated. We trust auth.uid() to be the
-- right user — the token alone proves they got the email.
DROP FUNCTION IF EXISTS public.accept_invitation(uuid);

CREATE OR REPLACE FUNCTION public.accept_invitation(p_token uuid)
RETURNS TABLE (
  ok           boolean,
  role         text,
  business_id  uuid
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

  -- Read the invitee's email straight from auth.users so we can verify
  -- the invitation was meant for the signed-in person.
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
    -- Most common cause: user signed in with a different account than the
    -- email the invite was sent to. Re-prompt with the right email.
    RAISE EXCEPTION 'invitation email does not match signed-in user';
  END IF;

  -- Idempotent: if already accepted by this user, return success quietly.
  IF v_inv.accepted_at IS NOT NULL THEN
    IF v_inv.accepted_by = v_uid THEN
      RETURN QUERY SELECT true, v_inv.role, v_inv.business_id;
      RETURN;
    END IF;
    RAISE EXCEPTION 'invitation already accepted by another account';
  END IF;

  -- Claim the invite + create the role row in one transaction.
  INSERT INTO public.business_users (user_id, business_id, role)
  VALUES (v_uid, v_inv.business_id, v_inv.role)
  ON CONFLICT (user_id, business_id, role) DO NOTHING;

  UPDATE public.pending_invitations
     SET accepted_at = now(),
         accepted_by = v_uid
   WHERE id = v_inv.id;

  RETURN QUERY SELECT true, v_inv.role, v_inv.business_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_invitation(uuid) TO authenticated;

-- ── 4) revoke_invitation ───────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.revoke_invitation(uuid);

CREATE OR REPLACE FUNCTION public.revoke_invitation(p_token uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv record;
BEGIN
  SELECT * INTO v_inv FROM public.pending_invitations WHERE token = p_token;
  IF v_inv.id IS NULL THEN
    RAISE EXCEPTION 'invitation not found';
  END IF;

  -- Caller must be the original inviter, an agency_admin, or the manager of
  -- the same business.
  IF NOT (
    v_inv.invited_by = auth.uid()
    OR public.is_agency_admin()
    OR (v_inv.business_id IS NOT NULL AND public.is_business_manager(v_inv.business_id))
  ) THEN
    RAISE EXCEPTION 'permission denied to revoke this invitation';
  END IF;

  -- Idempotent: if already revoked or already accepted, do nothing.
  IF v_inv.revoked_at IS NULL AND v_inv.accepted_at IS NULL THEN
    UPDATE public.pending_invitations
       SET revoked_at = now()
     WHERE id = v_inv.id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_invitation(uuid) TO authenticated;

-- ── 5) remove_team_member ──────────────────────────────────────────────────
-- Removes a user's role from a business (or, for role=agency_admin, removes
-- agency-wide access). Caller must be agency_admin OR manager of the same
-- business removing a business_staff.
DROP FUNCTION IF EXISTS public.remove_team_member(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.remove_team_member(
  p_user_id     uuid,
  p_business_id uuid,
  p_role        text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_user_id = auth.uid() THEN
    -- Don't let people lock themselves out
    RAISE EXCEPTION 'cannot remove yourself';
  END IF;
  IF NOT (
    public.is_agency_admin()
    OR (p_role = 'business_staff' AND public.is_business_manager(p_business_id))
  ) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;
  DELETE FROM public.business_users
   WHERE user_id    = p_user_id
     AND role       = p_role
     AND (business_id = p_business_id OR (business_id IS NULL AND p_business_id IS NULL));
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_team_member(uuid, uuid, text) TO authenticated;

-- ── 6) list_team_members ───────────────────────────────────────────────────
-- Returns current members + pending invitations for a business (or pass
-- NULL to get the agency-admin team).
DROP FUNCTION IF EXISTS public.list_team_members(uuid);

CREATE OR REPLACE FUNCTION public.list_team_members(p_business_id uuid DEFAULT NULL)
RETURNS TABLE (
  kind         text,                   -- 'member' | 'invitation'
  user_id      uuid,                   -- null for invitations
  email        text,
  full_name    text,                   -- null for invitations
  role         text,
  business_id  uuid,
  status       text,                   -- 'active' | 'pending' | 'revoked' | 'expired'
  token        uuid,                   -- only for invitations (so revoke works)
  created_at   timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Permission check
  IF p_business_id IS NULL THEN
    -- Agency-wide list — only agency_admin
    IF NOT public.is_agency_admin() THEN
      RAISE EXCEPTION 'permission denied';
    END IF;
  ELSE
    IF NOT (public.is_agency_admin() OR public.is_business_manager(p_business_id)) THEN
      RAISE EXCEPTION 'permission denied';
    END IF;
  END IF;

  RETURN QUERY
    -- Current members
    SELECT 'member'::text,
           u.user_id,
           p.email,
           p.full_name,
           u.role,
           u.business_id,
           'active'::text,
           NULL::uuid,
           u.created_at
      FROM public.business_users u
      JOIN public.profiles p ON p.id = u.user_id
     WHERE (p_business_id IS NOT NULL AND u.business_id = p_business_id)
        OR (p_business_id IS NULL AND u.role = 'agency_admin')
    UNION ALL
    -- Pending invitations
    SELECT 'invitation'::text,
           NULL::uuid,
           i.email,
           NULL::text,
           i.role,
           i.business_id,
           CASE
             WHEN i.accepted_at IS NOT NULL THEN 'active'
             WHEN i.revoked_at  IS NOT NULL THEN 'revoked'
             WHEN i.expires_at  <  now()    THEN 'expired'
             ELSE 'pending'
           END,
           i.token,
           i.created_at
      FROM public.pending_invitations i
     WHERE (p_business_id IS NOT NULL AND i.business_id = p_business_id)
        OR (p_business_id IS NULL AND i.role = 'agency_admin')
    ORDER BY 1 DESC, 9 DESC;   -- members first, then most-recent invitations
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_team_members(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification:
--   SELECT proname FROM pg_proc
--   WHERE proname IN ('create_invitation','accept_invitation','revoke_invitation',
--                     'remove_team_member','list_team_members');
--
--   SELECT * FROM public.list_team_members(NULL);                    -- agency
--   SELECT * FROM public.list_team_members('<business_id>');         -- one biz
-- ─────────────────────────────────────────────────────────────────────────────
