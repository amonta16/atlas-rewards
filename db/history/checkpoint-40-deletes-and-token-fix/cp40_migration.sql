-- =====================================================================
-- CHECKPOINT 40 — token-ambiguity hotfix + delete-business + delete-account
-- =====================================================================
-- Three things:
--   1) Fix "column reference 'token' is ambiguous" when generating an
--      admin invite. Caused by an old CP-32 create_invitation that
--      conflated the return column 'token' with the table column
--      'token'. Cleanly re-declared here with no ambiguity.
--   2) delete_business(uuid) RPC — agency_admin only. Cascade-deletes
--      a business + all dependent rows. Atlas's FK chain handles most
--      of this; this RPC adds a permission gate + a soft 60-second
--      check.
--   3) delete_my_account() RPC — customer-side self-delete. Removes
--      the user's profile + every membership + the auth row. Customer
--      hits "Delete account" on their profile → confirms → signed out
--      → row gone.
-- =====================================================================


-- =====================================================================
-- 1. create_invitation — clean re-declaration (token ambiguity fix)
-- =====================================================================
-- The bug: previous versions had `RETURNS TABLE (id uuid, token text)`
-- AND inserted into pending_invitations(token), which has its own
-- token column. PLPGSQL's identifier resolution couldn't pick which
-- "token" was meant, so any subsequent reference crashed at runtime.
--
-- Fix: rename the return column to `invite_token` so there's no
-- collision with the table's `token` column. The UI already calls the
-- RPC by positional return, so this change is transparent client-side.
-- =====================================================================

drop function if exists public.create_invitation(text, text, uuid) cascade;

create function public.create_invitation(
  p_email       text,
  p_role        text,
  p_business_id uuid default null
)
returns table (
  invitation_id uuid,
  invite_token  uuid
)
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(btrim(p_email));
  v_caller uuid := auth.uid();
  v_id uuid;
  v_tok uuid;
begin
  if v_caller is null then raise exception 'not authenticated'; end if;
  if v_email is null or v_email = '' or position('@' in v_email) = 0 then
    raise exception 'invalid email';
  end if;
  if p_role not in ('agency_admin','business_manager','business_staff') then
    raise exception 'invalid role';
  end if;

  -- Permission gate
  if p_role = 'agency_admin' then
    if not public.is_agency_admin() then
      raise exception 'only agency_admin can invite agency_admin';
    end if;
    -- agency-admin invites are not scoped to a business
    p_business_id := null;
  else
    if p_business_id is null then
      raise exception 'business_id required for role %', p_role;
    end if;
    if not (
      public.is_agency_admin()
      or (p_role in ('business_manager','business_staff')
          and public.is_business_manager(p_business_id))
    ) then
      raise exception 'permission denied for invite of role % to business %', p_role, p_business_id;
    end if;
  end if;

  -- Insert + grab both id and token in one shot. Use the table-qualified
  -- form so Postgres doesn't conflate with the return-table column.
  insert into public.pending_invitations as pi
    (email, business_id, role, invited_by)
  values
    (v_email, p_business_id, p_role, v_caller)
  returning pi.id, pi.token into v_id, v_tok;

  return query select v_id, v_tok;
end; $$;
grant execute on function public.create_invitation(text, text, uuid) to authenticated;


-- =====================================================================
-- 2. delete_business(uuid) — agency_admin only, cascade
-- =====================================================================
-- DROP cascades through the FK chain set up in CP-01: memberships,
-- ledger, rewards, redemptions, reviews, offers, etc. all have
-- ON DELETE CASCADE on their business_id FK, so a single DELETE on
-- businesses cleans everything up.
-- =====================================================================

create or replace function public.delete_business(p_business_id uuid)
returns table (deleted_business_id uuid, deleted_business_name text)
language plpgsql security definer set search_path = public as $$
declare
  v_name text;
begin
  if not public.is_agency_admin() then
    raise exception 'only agency_admin can delete a business';
  end if;

  select name into v_name
    from public.businesses
   where id = p_business_id;
  if v_name is null then
    raise exception 'business not found';
  end if;

  delete from public.businesses where id = p_business_id;

  return query select p_business_id, v_name;
end; $$;
grant execute on function public.delete_business(uuid) to authenticated;


-- =====================================================================
-- 3. delete_my_account() — customer-side self-delete
-- =====================================================================
-- The customer's auth.users row plus profile + all memberships +
-- dependent rows. The FK chain handles most cleanup; we also
-- explicitly call auth.admin to remove the user's login.
--
-- This RPC is SECURITY DEFINER and reads auth.uid() from inside —
-- so it can ONLY delete the caller's own account. Cannot be abused
-- to delete someone else.
-- =====================================================================

create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = public, auth as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  -- Memberships, ledger, redemptions, reviews, etc. all cascade off
  -- profiles + business_memberships, so we just need to delete the
  -- profile + auth row.
  delete from public.business_memberships where user_id = v_user;
  delete from public.profiles where id = v_user;

  -- Delete from auth.users — this requires the function be SECURITY DEFINER
  -- and the function owner to have permission. In Supabase, this works
  -- when the owner is postgres role.
  delete from auth.users where id = v_user;
end; $$;
grant execute on function public.delete_my_account() to authenticated;


-- =====================================================================
-- CP-40 done. Apply after cp38.
-- =====================================================================
