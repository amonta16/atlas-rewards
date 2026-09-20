-- ============================================================================
-- CP-142 — Kiosk waivers: a tablet at the front desk, for every business
-- ----------------------------------------------------------------------------
-- WHY
--   CP-137 assumes a waiver signer is a logged-in member. That covers the
--   customer who wants the signup offer. It does not cover the walk-in who
--   is standing at the counter, handed a tablet, who does not want an app.
--   Flippos has a tablet running someone else's waiver software for exactly
--   this. This replaces it.
--
-- THE MODEL (Andrew's call)
--   A kiosk signature is a STANDALONE record: a real row in
--   waiver_submissions with no membership and no user. It stands on its own
--   legally, shows up in the same staff list as app signatures, and can be
--   linked to a membership later if that person does join.
--
--   That requires membership_id and user_id to become nullable. Everything
--   that reads them already goes through functions that filter by
--   membership_id, so a null row simply never matches a member lookup —
--   which is correct, because it belongs to no member.
--
-- SECURITY
--   No anon grants. The kiosk page is served by the app and submits through
--   /api/waivers/kiosk-sign, which rate-limits and then calls this function
--   with the service role. There is deliberately no path for an anonymous
--   client to call sign_waiver_kiosk() directly with a forged business_id.
--
-- SAFE TO RE-RUN. Idempotent.
-- ============================================================================

begin;

-- ─── §1 — schema ────────────────────────────────────────────────────────────

alter table public.waiver_submissions alter column membership_id drop not null;
alter table public.waiver_submissions alter column user_id       drop not null;

alter table public.waiver_submissions
  add column if not exists source       text not null default 'app',
  add column if not exists signer_phone text,
  add column if not exists signer_dob   date;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'waiver_submissions_source_ck'
       and conrelid = 'public.waiver_submissions'::regclass
  ) then
    alter table public.waiver_submissions
      add constraint waiver_submissions_source_ck
      check (source in ('app', 'kiosk', 'guardian'));
  end if;
end $$;

-- A kiosk row has no member; an app row must have one. Enforced rather than
-- trusted, because a null membership on an app signature would silently
-- detach someone's waiver from their account.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'waiver_submissions_member_ck'
       and conrelid = 'public.waiver_submissions'::regclass
  ) then
    alter table public.waiver_submissions
      add constraint waiver_submissions_member_ck
      check (source = 'kiosk' or membership_id is not null);
  end if;
end $$;

create index if not exists waiver_submissions_kiosk_idx
  on public.waiver_submissions (business_id, signed_at desc)
  where source = 'kiosk';

-- Per-business switch, per-waiver. Off by default: a business has to turn
-- its kiosk on before a public tablet page will serve anything.
alter table public.business_waivers
  add column if not exists kiosk_enabled boolean not null default false;

comment on column public.waiver_submissions.source is
  'CP-142: app = signed by a logged-in member; kiosk = walk-in on the front-desk '
  'tablet (no membership); guardian = signed by a parent through /g/<token>.';
comment on column public.business_waivers.kiosk_enabled is
  'CP-142: when true, /<business>/kiosk serves this waiver on a public tablet page.';


-- ─── §2 — what the kiosk page renders ───────────────────────────────────────
-- Service-role only. The page is a server component; nothing reaches the
-- browser except the waiver text the business chose to publish.

create or replace function public.kiosk_waiver_for_business(p_business_id uuid)
returns table (
  waiver_id    uuid,
  waiver_title text,
  version_id   uuid,
  version_no   integer,
  body_text    text,
  minors_enabled boolean
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select w.id, w.title, w.current_version_id, v.version_no, v.body_text,
         coalesce(w.minors_enabled, true)
    from public.business_waivers w
    join public.waiver_versions v on v.id = w.current_version_id
   where w.business_id = p_business_id
     and w.kiosk_enabled
     and w.current_version_id is not null
   order by w.created_at
   limit 1;
$function$;


-- ─── §3 — the kiosk signature ───────────────────────────────────────────────
-- Same validation bar as sign_waiver_v2(), minus the membership. Name and
-- date of birth are required (Andrew's call); phone, email and minors are
-- accepted when given but never demanded.

create or replace function public.sign_waiver_kiosk(
  p_business_id        uuid,
  p_waiver_id          uuid,
  p_version_id         uuid,
  p_signer_name        text,
  p_signer_dob         date,
  p_signature_data_url text    default null,
  p_signature_typed    text    default null,
  p_consent_text       text    default null,
  p_signer_email       text    default null,
  p_signer_phone       text    default null,
  p_minors             jsonb   default '[]'::jsonb,
  p_user_agent         text    default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_current uuid;
  v_sha     text;
  v_minors  jsonb := coalesce(p_minors, '[]'::jsonb);
  v_id      uuid;
  m         jsonb;
  v_age     int;
begin
  -- The waiver must belong to this business, be kiosk-enabled, and the
  -- version being signed must be the CURRENT one. Signing a stale version
  -- is how you end up with signatures against text nobody can produce.
  select w.current_version_id into v_current
    from public.business_waivers w
   where w.id = p_waiver_id
     and w.business_id = p_business_id
     and w.kiosk_enabled;

  if v_current is null then raise exception 'kiosk is not enabled for this waiver'; end if;
  if v_current <> p_version_id then
    raise exception 'this waiver was updated — please reload and sign the latest version';
  end if;

  -- Required, in the database, not just in the form.
  if length(coalesce(btrim(p_signer_name), '')) < 2 then
    raise exception 'please enter your full name';
  end if;
  if p_signer_dob is null then
    raise exception 'please enter your date of birth';
  end if;
  if nullif(btrim(p_consent_text), '') is null then
    raise exception 'consent required';
  end if;
  if nullif(p_signature_data_url, '') is null
     and length(coalesce(btrim(p_signature_typed), '')) < 2 then
    raise exception 'please sign (draw or type your name)';
  end if;

  v_age := extract(year from age(p_signer_dob));
  if p_signer_dob > current_date then raise exception 'please check the date of birth'; end if;
  if v_age > 120 then raise exception 'please check the date of birth'; end if;
  -- No minor self-signs at a kiosk either. An adult has to be standing there.
  if v_age < 18 then
    raise exception 'a parent or guardian has to sign this for you';
  end if;

  if jsonb_typeof(v_minors) <> 'array' then raise exception 'invalid minors list'; end if;
  if jsonb_array_length(v_minors) > 12 then raise exception 'too many minors on one signature'; end if;
  for m in select * from jsonb_array_elements(v_minors) loop
    if length(coalesce(btrim(m->>'first'), '')) < 1
       or length(coalesce(btrim(m->>'last'), '')) < 1 then
      raise exception 'every minor needs a first and last name';
    end if;
  end loop;

  select v.body_sha256 into v_sha from public.waiver_versions v where v.id = p_version_id;

  insert into public.waiver_submissions
    (business_id, waiver_id, version_id, membership_id, user_id,
     signer_name, signer_email, signer_phone, signer_dob,
     signature_data_url, signature_typed, consent_text, body_sha256,
     minors, signer_relationship, source, user_agent)
  values
    (p_business_id, p_waiver_id, p_version_id, null, null,
     btrim(p_signer_name), nullif(btrim(p_signer_email), ''), nullif(btrim(p_signer_phone), ''),
     p_signer_dob,
     nullif(p_signature_data_url, ''), nullif(btrim(p_signature_typed), ''),
     btrim(p_consent_text), v_sha,
     v_minors,
     case when jsonb_array_length(v_minors) > 0 then 'guardian' else 'self' end,
     'kiosk', p_user_agent)
  returning id into v_id;

  return v_id;
end;
$function$;


-- ─── §4 — grants: service role only, never anon ─────────────────────────────

do $$
begin
  revoke all on function public.kiosk_waiver_for_business(uuid) from public;
  revoke all on function public.sign_waiver_kiosk(
    uuid, uuid, uuid, text, date, text, text, text, text, text, jsonb, text) from public;

  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.kiosk_waiver_for_business(uuid) from anon;
    revoke all on function public.sign_waiver_kiosk(
      uuid, uuid, uuid, text, date, text, text, text, text, text, jsonb, text) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.kiosk_waiver_for_business(uuid) from authenticated;
    revoke all on function public.sign_waiver_kiosk(
      uuid, uuid, uuid, text, date, text, text, text, text, text, jsonb, text) from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.kiosk_waiver_for_business(uuid) to service_role;
    grant execute on function public.sign_waiver_kiosk(
      uuid, uuid, uuid, text, date, text, text, text, text, text, jsonb, text) to service_role;
  end if;
end $$;


begin;

-- ─── §5 — the builder's kiosk switch ────────────────────────────────────────
-- A dedicated one-field RPC rather than widening upsert_waiver(): that
-- function is called from the builder with a fixed argument list, and a
-- trailing DEFAULT there would leave an ambiguous PostgREST overload — the
-- exact trap CP-140 hit with upsert_mystery_prize.

create or replace function public.set_waiver_kiosk(
  p_id uuid, p_business_id uuid, p_enabled boolean
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.staffs_business(p_business_id) then raise exception 'permission denied'; end if;

  update public.business_waivers w
     set kiosk_enabled = coalesce(p_enabled, false)
   where w.id = p_id and w.business_id = p_business_id;

  return found;
end;
$function$;

do $$
begin
  revoke all on function public.set_waiver_kiosk(uuid, uuid, boolean) from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.set_waiver_kiosk(uuid, uuid, boolean) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.set_waiver_kiosk(uuid, uuid, boolean) to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.set_waiver_kiosk(uuid, uuid, boolean) to service_role;
  end if;
end $$;

commit;

-- ─── verify (read-only) ─────────────────────────────────────────────────────
-- select column_name, is_nullable from information_schema.columns
--  where table_schema='public' and table_name='waiver_submissions'
--    and column_name in ('membership_id','user_id','source','signer_phone','signer_dob');
--
-- select proname, coalesce(array_to_string(proacl,' | '),'(PUBLIC)')
--   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--  where n.nspname='public' and proname in ('sign_waiver_kiosk','kiosk_waiver_for_business');
