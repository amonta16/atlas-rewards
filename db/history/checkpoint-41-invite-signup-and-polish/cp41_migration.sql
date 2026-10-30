-- =====================================================================
-- CHECKPOINT 41 — preview_invitation + better invite signup flow
-- =====================================================================
-- The accept-invitation page needs to know who the invite is FOR
-- (email + role + business_id) before the user creates their account.
-- Today the page assumed the user was already signed in.
--
-- This RPC is publicly readable by anyone holding a valid invite
-- token (the token itself is the auth — long random, single-use).
-- Returns the email so the signup form can lock it; returns the
-- role + business name so the page can say "You've been invited as
-- Manager for Joe's Gym."
--
-- Self-contained. Apply after cp40.
-- =====================================================================

create or replace function public.preview_invitation(p_token uuid)
returns table (
  email           text,
  role            text,
  business_id     uuid,
  business_name   text,
  expires_at      timestamptz,
  is_expired      boolean,
  is_accepted     boolean,
  is_revoked      boolean
)
language sql stable security definer set search_path = public as $$
  select
    pi.email,
    pi.role,
    pi.business_id,
    b.name as business_name,
    pi.expires_at,
    (pi.expires_at < now()) as is_expired,
    (pi.accepted_at is not null) as is_accepted,
    (pi.revoked_at is not null) as is_revoked
  from public.pending_invitations pi
  left join public.businesses b on b.id = pi.business_id
  where pi.token = p_token;
$$;
grant execute on function public.preview_invitation(uuid) to anon, authenticated;

-- =====================================================================
-- CP-41 done.
-- =====================================================================
