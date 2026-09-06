-- ============================================================================
-- CP-130 · Front desk: phone-number lookup + removal guardrail
-- ----------------------------------------------------------------------------
-- Run in the Supabase SQL editor BEFORE deploying the CP-130 app build.
-- Self-contained: safe to re-run.
--
-- What this adds
--   1. resolve_member_by_phone(p_phone, p_business_id)
--        Same row shape as resolve_member_by_code (CP-118) so the desk can
--        drop the result straight into the award panel. Exact match on the
--        last 10 digits (normalize_phone from CP-59); if the staff typed only
--        7 digits (no area code) it falls back to a last-7 match, and returns
--        a row ONLY when that match is unique inside this business — an
--        ambiguous 7-digit hit returns nothing rather than the wrong member.
--        Gated exactly like the code resolver (staff of this business, or
--        agency admin/VA).
--
-- Why
--   Every big loyalty program (Dutch Bros, Square, Toast, Bowlero, Topgolf,
--   Alpine IQ, Dutchie) identifies a member by phone number when there is no
--   scan. Customers know their phone number; they never know a 6-char code.
--   The "Type the code" box on the desk now accepts either.
--
-- The removal guardrail (confirm step on removals over 500 points, reason
-- required) is app-side only — no SQL.
-- ============================================================================

drop function if exists public.resolve_member_by_phone(text, uuid);

create function public.resolve_member_by_phone(p_phone text, p_business_id uuid)
returns table (
  membership_id uuid, user_id uuid, full_name text, email text, phone text,
  points_balance integer, tier text, joined_at timestamptz, visit_count integer
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_last10 text;
  v_last7  text;
  v_n      integer;
begin
  -- Same gate as resolve_member_by_code (CP-118): staff of this business, or
  -- agency-level admin/VA.
  if not exists (
    select 1 from public.business_users bu
     where bu.user_id = auth.uid()
       and (bu.business_id = p_business_id
            or (bu.business_id is null and bu.role in ('agency_admin','agency_va')))
  ) then
    return;
  end if;

  if length(v_digits) < 7 then
    return;
  end if;

  -- Full number (10 digits, or 11 with a leading 1): exact match on the
  -- normalized last-10.
  if length(v_digits) >= 10 then
    v_last10 := right(v_digits, 10);
    return query
      select m.id::uuid, m.user_id::uuid, p.full_name::text, p.email::text, p.phone::text,
             m.points_balance::integer, m.tier::text, m.joined_at::timestamptz, m.visit_count::integer
        from public.business_memberships m
        join public.profiles p on p.id = m.user_id
       where m.business_id = p_business_id
         and public.normalize_phone(p.phone) = v_last10
       order by coalesce(m.last_visit_at, m.joined_at) desc
       limit 1;
    return;
  end if;

  -- 7–9 digits (staff skipped the area code): last-7 match, only if unique.
  v_last7 := right(v_digits, 7);
  select count(*) into v_n
    from public.business_memberships m
    join public.profiles p on p.id = m.user_id
   where m.business_id = p_business_id
     and right(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), 7) = v_last7;

  if v_n = 1 then
    return query
      select m.id::uuid, m.user_id::uuid, p.full_name::text, p.email::text, p.phone::text,
             m.points_balance::integer, m.tier::text, m.joined_at::timestamptz, m.visit_count::integer
        from public.business_memberships m
        join public.profiles p on p.id = m.user_id
       where m.business_id = p_business_id
         and right(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), 7) = v_last7
       limit 1;
  end if;
  return;
end; $$;

revoke all on function public.resolve_member_by_phone(text, uuid) from public;
grant execute on function public.resolve_member_by_phone(text, uuid) to authenticated;

-- Lookup index: normalize_phone is IMMUTABLE (CP-59), so this expression
-- index makes the 10-digit path an index hit even at thousands of profiles.
create index if not exists profiles_normalized_phone_idx
  on public.profiles (public.normalize_phone(phone));

-- ── verify ──────────────────────────────────────────────────────────────
-- select proname, prosecdef from pg_proc where proname = 'resolve_member_by_phone';
-- select * from public.resolve_member_by_phone('(805) 555-0123', '<business uuid>');
