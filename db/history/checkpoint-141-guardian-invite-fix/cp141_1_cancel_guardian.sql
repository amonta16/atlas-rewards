-- ============================================================================
-- CP-141.1 — let someone back out of the guardian path
-- ----------------------------------------------------------------------------
-- WHY
--   CP-137's gate is deliberately a dead end: once a guardian request is
--   pending, my_waiver_gate() returns 'awaiting_guardian' and the app renders
--   the waiting screen INSTEAD of the app. That is correct for a real minor.
--   It is a trap for an adult who tapped the wrong button — they now have no
--   route back to the signing form, and no way into the app, until a parent
--   who does not exist signs something.
--
--   This adds the one missing door: cancel your OWN pending request.
--
-- WHY THIS IS NOT A BYPASS
--   Cancelling unlocks nothing. It returns the member to the signing screen,
--   where sign_waiver_v2() still refuses a date of birth under 18, exactly as
--   before. A minor who cancels can only end up back where they started or
--   name a guardian again. The gate is unchanged; only the pending request is.
--
--   Scoped to the caller's own membership, so one member can never cancel
--   another's request.
--
-- SIDE EFFECT WORTH KNOWING
--   Cancelling invalidates the token, so any link already emailed to a parent
--   stops working. The UI warns about this before calling.
--
-- SAFE TO RE-RUN.
-- ============================================================================

begin;

create or replace function public.cancel_guardian_request(p_business_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_mem uuid;
  v_n   integer;
begin
  select bm.id into v_mem
    from public.business_memberships bm
   where bm.business_id = p_business_id
     and bm.user_id = auth.uid();

  if v_mem is null then
    raise exception 'not a member of this business' using errcode = '42501';
  end if;

  -- Only this member's own pending requests. A request already signed is
  -- left alone — the coverage it produced is what unlocks the app, and
  -- cancelling it would be destroying a real signature.
  update public.waiver_guardian_requests g
     set status = 'cancelled'
   where g.membership_id = v_mem
     and g.business_id   = p_business_id
     and g.status        = 'pending';

  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

comment on function public.cancel_guardian_request(uuid) is
  'CP-141.1: cancels the caller''s own pending guardian request so they land '
  'back on the signing screen. Unlocks nothing — the adult-age check in '
  'sign_waiver_v2() is untouched. Invalidates any emailed link.';

do $$
begin
  revoke all on function public.cancel_guardian_request(uuid) from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.cancel_guardian_request(uuid) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.cancel_guardian_request(uuid) to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.cancel_guardian_request(uuid) to service_role;
  end if;
end $$;

commit;

-- ─── verify (read-only) ─────────────────────────────────────────────────────
-- select p.proname, coalesce(array_to_string(p.proacl, ' | '), '(PUBLIC)')
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public' and p.proname = 'cancel_guardian_request';
