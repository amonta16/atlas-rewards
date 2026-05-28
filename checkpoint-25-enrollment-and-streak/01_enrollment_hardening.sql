-- =====================================================================
-- CHECKPOINT 25 — Self-healing enrollment + streak visibility
-- =====================================================================
-- Andrew reported that QR enrollment works for his own
-- (andrewmontano619@gmail.com) account but freshly-created users get
-- stuck on "Setting up your QR…". Two root causes:
--
--   1. gen_random_bytes() in enroll_member silently fails if the
--      pgcrypto extension wasn't installed on the project (some
--      Supabase projects have it on, some don't).
--   2. Once a row is created with referral_code = NULL it stays that
--      way — the client polling we added in CP-24 keeps calling
--      enroll_member() but enroll_member short-circuits the moment a
--      row exists for (user_id, business_id), so the NULL never gets
--      patched.
--
-- This patch is idempotent. Paste into Supabase SQL editor → Run.
-- =====================================================================

-- ----- 1. Make sure pgcrypto is available --------------------------------
create extension if not exists pgcrypto;

-- ----- 2. Safer enrollment ----------------------------------------------
-- Same external signature as before so the existing client code keeps
-- working. Internally:
--   • use a md5(random()::text) fallback so we never depend on pgcrypto
--     having to be on
--   • patch any pre-existing row that has a NULL referral_code
--   • return the membership id even on the patch path
create or replace function public.enroll_member(
  p_user_id      uuid,
  p_business_id  uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membership_id  uuid;
  v_ref_code       text;
  v_existing_code  text;
  v_bonus          integer;
begin
  -- Existing row?
  select id, referral_code
    into v_membership_id, v_existing_code
    from public.business_memberships
   where user_id = p_user_id
     and business_id = p_business_id;

  if v_membership_id is not null then
    -- CP-25: backfill missing referral_code on an existing row so the
    -- client's polling loop can finally observe a code.
    if v_existing_code is null then
      loop
        v_ref_code := upper(substring(
          regexp_replace(md5(random()::text || clock_timestamp()::text), '[^A-F0-9]', '', 'g')
          from 1 for 6));
        exit when length(v_ref_code) = 6
             and not exists (select 1 from public.business_memberships where referral_code = v_ref_code);
      end loop;

      update public.business_memberships
         set referral_code = v_ref_code, updated_at = now()
       where id = v_membership_id;
    end if;
    return v_membership_id;
  end if;

  -- Brand-new enrollment.
  loop
    v_ref_code := upper(substring(
      regexp_replace(md5(random()::text || clock_timestamp()::text), '[^A-F0-9]', '', 'g')
      from 1 for 6));
    exit when length(v_ref_code) = 6
         and not exists (select 1 from public.business_memberships where referral_code = v_ref_code);
  end loop;

  insert into public.business_memberships (user_id, business_id, referral_code)
       values (p_user_id, p_business_id, v_ref_code)
    returning id into v_membership_id;

  -- First-visit bonus from the business's point_rules
  select coalesce((point_rules->>'first_visit_bonus')::int, 0)
    into v_bonus from public.businesses where id = p_business_id;

  if v_bonus > 0 then
    begin
      perform public.award_points(
        v_membership_id, v_bonus, 'first_visit_bonus',
        null, 'first_visit_' || v_membership_id::text, 'Welcome bonus'
      );
    exception when others then
      -- Never let a bonus failure block enrollment — the membership
      -- row + referral_code matter more than the welcome points.
      null;
    end;
  end if;

  return v_membership_id;
end;
$$;

grant execute on function public.enroll_member(uuid, uuid) to authenticated;

-- ----- 3. One-time backfill for already-broken rows ----------------------
-- Patch any existing memberships that ended up with referral_code IS NULL
-- (e.g. customers Andrew already created who are stuck on the spinner).
do $$
declare
  r record;
  v_code text;
begin
  for r in
    select id from public.business_memberships where referral_code is null
  loop
    loop
      v_code := upper(substring(
        regexp_replace(md5(random()::text || clock_timestamp()::text), '[^A-F0-9]', '', 'g')
        from 1 for 6));
      exit when length(v_code) = 6
           and not exists (select 1 from public.business_memberships where referral_code = v_code);
    end loop;
    update public.business_memberships set referral_code = v_code where id = r.id;
  end loop;
end $$;

-- ----- 4. Reload PostgREST schema cache ----------------------------------
notify pgrst, 'reload schema';
