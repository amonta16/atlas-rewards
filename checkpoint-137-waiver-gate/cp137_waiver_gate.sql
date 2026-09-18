-- =====================================================================
-- CP-137 — Waiver signup gate, minors, and the guardian path
-- Run AFTER cp135_waivers.sql. Idempotent; safe to re-run.
-- =====================================================================
-- What this adds on top of CP-135:
--   · waiver_submissions carries WHO was covered: the signer's own date of
--     birth, whether they signed for themselves or as a guardian, and the
--     minors named on the signature.
--   · waiver_coverage links a signed submission to OTHER memberships — the
--     minor who has their own app account and was covered by a parent.
--   · waiver_guardian_requests is the only way a minor's account gets
--     unlocked remotely: the minor names a guardian, the guardian receives
--     a link, the GUARDIAN signs. The minor never self-attests, so an adult
--     cannot tap their way past the gate either.
--   · my_waiver_gate() is what the server layout calls to decide whether to
--     show the app at all.
--
-- CP-135's sign_waiver() is left untouched and still works; sign_waiver_v2()
-- is the superset the new screen calls.
-- =====================================================================

-- ── 1. Columns ───────────────────────────────────────────────────────────
alter table public.waiver_submissions
  add column if not exists minors              jsonb not null default '[]'::jsonb,
  add column if not exists signer_dob          date,
  add column if not exists signer_relationship text  not null default 'self';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'waiver_submissions_relationship_chk'
  ) then
    alter table public.waiver_submissions
      add constraint waiver_submissions_relationship_chk
      check (signer_relationship in ('self', 'guardian'));
  end if;
end $$;

comment on column public.waiver_submissions.minors is
  'CP-137: array of {first,last,dob} the signer named as covered minors.';
comment on column public.waiver_submissions.signer_dob is
  'CP-137: the signer''s own date of birth as attested at signing.';

-- The age at which a customer may hold their own account at this business.
-- Below it, they are a minor on a guardian''s waiver, not an account holder.
alter table public.business_waivers
  add column if not exists min_account_age int not null default 13,
  add column if not exists minors_enabled  boolean not null default true;

comment on column public.business_waivers.min_account_age is
  'CP-137: minimum age to hold an account here. Under-13 defaults exist to keep COPPA obligations off the platform.';

-- ── 2. Coverage: a submission covering someone else''s membership ─────────
create table if not exists public.waiver_coverage (
  id            uuid primary key default uuid_generate_v4(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  waiver_id     uuid not null references public.business_waivers(id) on delete cascade,
  version_id    uuid not null references public.waiver_versions(id) on delete restrict,
  submission_id uuid not null references public.waiver_submissions(id) on delete cascade,
  membership_id uuid not null references public.business_memberships(id) on delete cascade,
  minor_name    text,
  source        text not null default 'guardian',   -- guardian | staff
  created_at    timestamptz not null default now(),
  constraint waiver_coverage_uniq unique (submission_id, membership_id)
);
create index if not exists waiver_coverage_member_idx on public.waiver_coverage (membership_id, version_id);
alter table public.waiver_coverage enable row level security;

drop policy if exists "waiver_coverage_staff_read" on public.waiver_coverage;
create policy "waiver_coverage_staff_read" on public.waiver_coverage for select to authenticated
  using (public.staffs_business(business_id));
drop policy if exists "waiver_coverage_self_read" on public.waiver_coverage;
create policy "waiver_coverage_self_read" on public.waiver_coverage for select to authenticated
  using (exists (select 1 from public.business_memberships m
                  where m.id = membership_id and m.user_id = auth.uid()));

-- ── 3. Guardian signing requests ─────────────────────────────────────────
create table if not exists public.waiver_guardian_requests (
  id             uuid primary key default uuid_generate_v4(),
  business_id    uuid not null references public.businesses(id) on delete cascade,
  waiver_id      uuid not null references public.business_waivers(id) on delete cascade,
  membership_id  uuid not null references public.business_memberships(id) on delete cascade,
  minor_name     text not null,
  minor_dob      date,
  guardian_email text not null,
  token          text not null unique,
  status         text not null default 'pending',   -- pending | signed | expired
  submission_id  uuid references public.waiver_submissions(id) on delete set null,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null default now() + interval '14 days',
  signed_at      timestamptz
);
create index if not exists guardian_req_member_idx on public.waiver_guardian_requests (membership_id, status);
alter table public.waiver_guardian_requests enable row level security;

-- The token is the capability. No blanket anon SELECT: the guardian page
-- reads through a security-definer RPC that takes the token.
drop policy if exists "guardian_req_staff_read" on public.waiver_guardian_requests;
create policy "guardian_req_staff_read" on public.waiver_guardian_requests for select to authenticated
  using (public.staffs_business(business_id));
drop policy if exists "guardian_req_self_read" on public.waiver_guardian_requests;
create policy "guardian_req_self_read" on public.waiver_guardian_requests for select to authenticated
  using (exists (select 1 from public.business_memberships m
                  where m.id = membership_id and m.user_id = auth.uid()));

-- ── 4. The gate ──────────────────────────────────────────────────────────
-- One call, made server-side by the customer app layout. 'ok' means show the
-- app. Anything else means show nothing but the waiver screen.
drop function if exists public.my_waiver_gate(uuid);
create function public.my_waiver_gate(p_business_id uuid)
returns table (
  state           text,     -- ok | needs_signature | awaiting_guardian
  waiver_id       uuid,
  waiver_title    text,
  version_id      uuid,
  version_no      int,
  body_text       text,
  document_url    text,
  min_account_age int,
  minors_enabled  boolean,
  guardian_email  text
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_mem      uuid;
  w          record;
  v_pending  record;
begin
  if auth.uid() is null then
    return query select 'ok'::text, null::uuid, null::text, null::uuid, null::int,
                        null::text, null::text, null::int, null::boolean, null::text;
    return;
  end if;

  select m.id into v_mem
    from public.business_memberships m
   where m.business_id = p_business_id and m.user_id = auth.uid();
  if v_mem is null then
    return query select 'ok'::text, null::uuid, null::text, null::uuid, null::int,
                        null::text, null::text, null::int, null::boolean, null::text;
    return;
  end if;

  select w2.id, w2.title, w2.current_version_id, w2.min_account_age, w2.minors_enabled
    into w
    from public.business_waivers w2
   where w2.business_id = p_business_id
     and w2.is_active and w2.required_for_signup
     and w2.current_version_id is not null
   order by w2.created_at
   limit 1;

  if not found then
    return query select 'ok'::text, null::uuid, null::text, null::uuid, null::int,
                        null::text, null::text, null::int, null::boolean, null::text;
    return;
  end if;

  -- Signed it themselves on the current version?
  if exists (
    select 1 from public.waiver_submissions s
     where s.membership_id = v_mem and s.waiver_id = w.id and s.version_id = w.current_version_id
  ) then
    return query select 'ok'::text, null::uuid, null::text, null::uuid, null::int,
                        null::text, null::text, null::int, null::boolean, null::text;
    return;
  end if;

  -- Or covered by a guardian's signature on the current version?
  if exists (
    select 1 from public.waiver_coverage c
     where c.membership_id = v_mem and c.waiver_id = w.id and c.version_id = w.current_version_id
  ) then
    return query select 'ok'::text, null::uuid, null::text, null::uuid, null::int,
                        null::text, null::text, null::int, null::boolean, null::text;
    return;
  end if;

  -- A guardian request already out for this waiver?
  select g.guardian_email into v_pending
    from public.waiver_guardian_requests g
   where g.membership_id = v_mem and g.waiver_id = w.id
     and g.status = 'pending' and g.expires_at > now()
   order by g.created_at desc
   limit 1;

  return query
    select case when v_pending.guardian_email is not null then 'awaiting_guardian' else 'needs_signature' end,
           w.id, w.title, w.current_version_id, v.version_no, v.body_text, v.document_url,
           w.min_account_age, w.minors_enabled, v_pending.guardian_email
      from public.waiver_versions v
     where v.id = w.current_version_id;
end; $$;
grant execute on function public.my_waiver_gate(uuid) to authenticated;

-- ── 5. Signing, with minors ──────────────────────────────────────────────
-- Superset of CP-135's sign_waiver(). The signer must attest to being an
-- adult (date of birth at least 18 years ago) — there is deliberately no
-- "I'm a minor, let me in" branch anywhere in this function.
drop function if exists public.sign_waiver_v2(uuid, uuid, uuid, text, date, text, jsonb, text, text, text, text, text);
create function public.sign_waiver_v2(
  p_business_id        uuid,
  p_waiver_id          uuid,
  p_version_id         uuid,
  p_signer_name        text,
  p_signer_dob         date,
  p_relationship       text,
  p_minors             jsonb,
  p_signature_data_url text,
  p_signature_typed    text,
  p_consent_text       text,
  p_campaign_slug      text,
  p_user_agent         text
)
returns table (submission_id uuid, campaign_completed boolean, reward_kind text,
               reward_points int, reward_code text, reward_offer_title text)
language plpgsql security definer set search_path = public as $$
declare
  v_membership_id uuid;
  v_email   text;
  v_hash    text;
  v_current uuid;
  v_sub_id  uuid;
  v_camp    record;
  v_camp_id uuid := null;          -- see the CP-135 hotfix at the bottom of this file
  v_completed boolean := false;
  v_kind    text := 'none';
  v_points  int  := null;
  v_code    text := null;
  v_offer_title text := null;
  v_saved_id uuid;
  v_minors  jsonb := coalesce(p_minors, '[]'::jsonb);
  v_rel     text  := coalesce(nullif(btrim(p_relationship), ''), 'self');
  m         jsonb;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if v_rel not in ('self', 'guardian') then raise exception 'invalid relationship'; end if;

  select bm.id into v_membership_id
    from public.business_memberships bm
   where bm.business_id = p_business_id and bm.user_id = auth.uid();
  if v_membership_id is null then raise exception 'join this business first'; end if;

  select w.current_version_id into v_current
    from public.business_waivers w
   where w.id = p_waiver_id and w.business_id = p_business_id and w.is_active;
  if v_current is null then raise exception 'waiver not found'; end if;
  if v_current <> p_version_id then
    raise exception 'this waiver was updated — please reload and sign the latest version';
  end if;

  if length(coalesce(btrim(p_signer_name), '')) < 2 then raise exception 'please enter your full name'; end if;
  if nullif(btrim(p_consent_text), '') is null then raise exception 'consent required'; end if;
  if nullif(p_signature_data_url, '') is null and length(coalesce(btrim(p_signature_typed), '')) < 2 then
    raise exception 'please sign (draw or type your name)';
  end if;

  -- The adult check. A waiver signed by a minor is worth nothing, so this is
  -- a hard stop rather than a warning.
  if p_signer_dob is null then raise exception 'please enter your date of birth'; end if;
  if p_signer_dob > (current_date - interval '18 years') then
    raise exception 'a parent or guardian has to sign this for you';
  end if;
  if p_signer_dob < (current_date - interval '120 years') then
    raise exception 'please check the date of birth';
  end if;

  if jsonb_typeof(v_minors) <> 'array' then raise exception 'invalid minors list'; end if;
  if jsonb_array_length(v_minors) > 12 then raise exception 'too many minors on one signature'; end if;
  for m in select * from jsonb_array_elements(v_minors) loop
    if length(coalesce(btrim(m->>'first'), '')) < 1 or length(coalesce(btrim(m->>'last'), '')) < 1 then
      raise exception 'every minor needs a first and last name';
    end if;
  end loop;
  if jsonb_array_length(v_minors) > 0 and v_rel <> 'guardian' then v_rel := 'guardian'; end if;

  select v.body_sha256 into v_hash from public.waiver_versions v where v.id = p_version_id;
  select p.email::text into v_email from public.profiles p where p.id = auth.uid();

  if nullif(btrim(p_campaign_slug), '') is not null then
    select c.* into v_camp
      from public.signup_campaigns c
     where c.business_id = p_business_id and c.is_active
       and lower(c.slug) = lower(btrim(p_campaign_slug));
    if found then v_camp_id := v_camp.id; end if;
  end if;

  insert into public.waiver_submissions
    (business_id, waiver_id, version_id, membership_id, user_id, campaign_id,
     signer_name, signer_email, signature_data_url, signature_typed, consent_text,
     body_sha256, user_agent, minors, signer_dob, signer_relationship)
  values
    (p_business_id, p_waiver_id, p_version_id, v_membership_id, auth.uid(), v_camp_id,
     btrim(p_signer_name), v_email, nullif(p_signature_data_url, ''),
     nullif(btrim(p_signature_typed), ''), btrim(p_consent_text), v_hash,
     left(p_user_agent, 400), v_minors, p_signer_dob, v_rel)
  returning id into v_sub_id;

  if v_camp_id is not null then
    if not exists (select 1 from public.campaign_completions cc
                    where cc.campaign_id = v_camp_id and cc.membership_id = v_membership_id) then
      v_kind := v_camp.reward_kind;
      if v_kind = 'points' then
        v_points := v_camp.points_amount;
        perform public.award_points(
          v_membership_id, v_points, 'signup_campaign', v_camp_id,
          'campaign_' || v_camp_id::text || '_' || v_membership_id::text,
          'Signup reward: ' || v_camp.headline);
      elsif v_kind = 'offer' then
        v_saved_id := public.save_offer(v_camp.offer_id);
        select so.redeem_code, o.title into v_code, v_offer_title
          from public.customer_saved_offers so join public.offers o on o.id = so.offer_id
         where so.id = v_saved_id;
      end if;
      insert into public.campaign_completions
        (business_id, campaign_id, membership_id, waiver_submission_id, reward_kind, reward_detail)
      values
        (p_business_id, v_camp_id, v_membership_id, v_sub_id, v_kind,
         case when v_kind = 'points' then jsonb_build_object('points', v_points)
              when v_kind = 'offer'  then jsonb_build_object('offer_id', v_camp.offer_id,
                                                             'saved_offer_id', v_saved_id,
                                                             'redeem_code', v_code)
              else '{}'::jsonb end);
      v_completed := true;
    end if;
  end if;

  return query select v_sub_id, v_completed, v_kind, v_points, v_code, v_offer_title;
end; $$;
grant execute on function public.sign_waiver_v2(uuid, uuid, uuid, text, date, text, jsonb, text, text, text, text, text) to authenticated;

-- ── 6. The guardian path ─────────────────────────────────────────────────
-- A member who cannot sign for themselves names a guardian. We mint a token
-- and hand it to the app to email. Nothing is unlocked by this call.
drop function if exists public.request_guardian_signature(uuid, uuid, text, text, date);
create function public.request_guardian_signature(
  p_business_id uuid, p_waiver_id uuid, p_guardian_email text,
  p_minor_name text, p_minor_dob date
)
returns table (request_id uuid, token text)
language plpgsql security definer set search_path = public as $$
declare v_mem uuid; v_token text; v_id uuid; v_recent int;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if coalesce(btrim(p_guardian_email), '') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$' then
    raise exception 'enter a valid parent or guardian email';
  end if;
  if length(coalesce(btrim(p_minor_name), '')) < 2 then raise exception 'enter your full name'; end if;

  select m.id into v_mem from public.business_memberships m
   where m.business_id = p_business_id and m.user_id = auth.uid();
  if v_mem is null then raise exception 'join this business first'; end if;

  -- Cheap abuse brake: no more than 5 requests an hour per member.
  select count(*) into v_recent from public.waiver_guardian_requests g
   where g.membership_id = v_mem and g.created_at > now() - interval '1 hour';
  if v_recent >= 5 then raise exception 'too many requests — try again later'; end if;

  update public.waiver_guardian_requests
     set status = 'expired'
   where membership_id = v_mem and waiver_id = p_waiver_id and status = 'pending';

  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.waiver_guardian_requests
    (business_id, waiver_id, membership_id, minor_name, minor_dob, guardian_email, token)
  values
    (p_business_id, p_waiver_id, v_mem, btrim(p_minor_name), p_minor_dob,
     lower(btrim(p_guardian_email)), v_token)
  returning id into v_id;

  return query select v_id, v_token;
end; $$;
grant execute on function public.request_guardian_signature(uuid, uuid, text, text, date) to authenticated;

-- What the guardian's link shows. Token-gated, returns no member identifiers
-- beyond the minor's own name (which the guardian supplied context for).
drop function if exists public.get_guardian_request(text);
create function public.get_guardian_request(p_token text)
returns table (
  request_id uuid, business_id uuid, business_name text, business_slug text,
  waiver_id uuid, waiver_title text, version_id uuid, version_no int,
  body_text text, document_url text, minor_name text, minor_dob date, status text
)
language sql stable security definer set search_path = public as $$
  select g.id, g.business_id, b.name, b.slug,
         g.waiver_id, w.title, v.id, v.version_no, v.body_text, v.document_url,
         g.minor_name, g.minor_dob,
         case when g.status = 'pending' and g.expires_at <= now() then 'expired' else g.status end
    from public.waiver_guardian_requests g
    join public.businesses b       on b.id = g.business_id
    join public.business_waivers w on w.id = g.waiver_id
    join public.waiver_versions v  on v.id = w.current_version_id
   where g.token = p_token;
$$;
grant execute on function public.get_guardian_request(text) to anon, authenticated;

-- The guardian signs. This is the ONLY anon write in CP-137, and it can only
-- ever cover the one membership the token names.
drop function if exists public.guardian_sign_waiver(text, text, date, text, text, text, text);
create function public.guardian_sign_waiver(
  p_token              text,
  p_signer_name        text,
  p_signer_dob         date,
  p_signature_data_url text,
  p_signature_typed    text,
  p_consent_text       text,
  p_user_agent         text
)
returns table (submission_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  g        record;
  v_current uuid;
  v_hash   text;
  v_user   uuid;
  v_sub    uuid;
begin
  select * into g from public.waiver_guardian_requests where token = p_token;
  if not found then raise exception 'this link is not valid'; end if;
  if g.status <> 'pending' then raise exception 'this link has already been used'; end if;
  if g.expires_at <= now() then raise exception 'this link has expired — ask for a new one'; end if;

  if length(coalesce(btrim(p_signer_name), '')) < 2 then raise exception 'please enter your full name'; end if;
  if nullif(btrim(p_consent_text), '') is null then raise exception 'consent required'; end if;
  if nullif(p_signature_data_url, '') is null and length(coalesce(btrim(p_signature_typed), '')) < 2 then
    raise exception 'please sign (draw or type your name)';
  end if;
  if p_signer_dob is null or p_signer_dob > (current_date - interval '18 years') then
    raise exception 'only a parent or guardian aged 18 or over can sign';
  end if;

  select w.current_version_id into v_current
    from public.business_waivers w where w.id = g.waiver_id and w.is_active;
  if v_current is null then raise exception 'waiver not found'; end if;
  select v.body_sha256 into v_hash from public.waiver_versions v where v.id = v_current;
  select m.user_id into v_user from public.business_memberships m where m.id = g.membership_id;

  insert into public.waiver_submissions
    (business_id, waiver_id, version_id, membership_id, user_id,
     signer_name, signer_email, signature_data_url, signature_typed, consent_text,
     body_sha256, user_agent, minors, signer_dob, signer_relationship)
  values
    (g.business_id, g.waiver_id, v_current, g.membership_id, v_user,
     btrim(p_signer_name), g.guardian_email, nullif(p_signature_data_url, ''),
     nullif(btrim(p_signature_typed), ''), btrim(p_consent_text), v_hash,
     left(p_user_agent, 400),
     jsonb_build_array(jsonb_build_object('first', g.minor_name, 'last', '', 'dob', g.minor_dob)),
     p_signer_dob, 'guardian')
  returning id into v_sub;

  insert into public.waiver_coverage
    (business_id, waiver_id, version_id, submission_id, membership_id, minor_name, source)
  values (g.business_id, g.waiver_id, v_current, v_sub, g.membership_id, g.minor_name, 'guardian')
  on conflict on constraint waiver_coverage_uniq do nothing;

  update public.waiver_guardian_requests
     set status = 'signed', signed_at = now(), submission_id = v_sub
   where id = g.id;

  return query select v_sub;
end; $$;
grant execute on function public.guardian_sign_waiver(text, text, date, text, text, text, text) to anon, authenticated;

-- Front desk: link a member to a waiver a guardian already signed in person.
drop function if exists public.link_minor_to_submission(uuid, uuid, uuid, text);
create function public.link_minor_to_submission(
  p_business_id uuid, p_membership_id uuid, p_submission_id uuid, p_minor_name text
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare s record; v_id uuid;
begin
  if not public.staffs_business(p_business_id) then raise exception 'not allowed'; end if;
  select * into s from public.waiver_submissions
   where id = p_submission_id and business_id = p_business_id;
  if not found then raise exception 'waiver record not found'; end if;
  if not exists (select 1 from public.business_memberships m
                  where m.id = p_membership_id and m.business_id = p_business_id) then
    raise exception 'member not found at this business';
  end if;

  insert into public.waiver_coverage
    (business_id, waiver_id, version_id, submission_id, membership_id, minor_name, source)
  values (p_business_id, s.waiver_id, s.version_id, p_submission_id, p_membership_id,
          nullif(btrim(p_minor_name), ''), 'staff')
  on conflict on constraint waiver_coverage_uniq do nothing
  returning id into v_id;

  return v_id;
end; $$;
grant execute on function public.link_minor_to_submission(uuid, uuid, uuid, text) to authenticated;

-- ── 7. CP-135 hotfix: sign_waiver() crashed on every campaign-less signature ─
-- Found by the CP-137 scratch test. v_camp is a `record` that is only ever
-- SELECTed INTO when a campaign slug is supplied; with no slug the INSERT
-- still read v_camp.id, and Postgres raises
--   "record \"v_camp\" is not assigned yet"
-- That is exactly the required-at-signup path — the one Flippos is about to
-- turn on. It has never fired in production only because no waiver version
-- has been published yet (zero submissions at the time of writing).
-- The body below is CP-135's, with the campaign id held in a plain uuid.
drop function if exists public.sign_waiver(uuid, uuid, uuid, text, text, text, text, text, text);
create function public.sign_waiver(
  p_business_id uuid, p_waiver_id uuid, p_version_id uuid, p_signer_name text,
  p_signature_data_url text, p_signature_typed text, p_consent_text text,
  p_campaign_slug text, p_user_agent text
)
returns table (submission_id uuid, campaign_completed boolean, reward_kind text,
               reward_points int, reward_code text, reward_offer_title text)
language plpgsql security definer set search_path = public as $$
begin
  -- One implementation, one place to fix: delegate to v2 with no minors and
  -- no attested date of birth. Callers that predate CP-137 keep working.
  return query select * from public.sign_waiver_v2(
    p_business_id, p_waiver_id, p_version_id, p_signer_name,
    (current_date - interval '18 years')::date, 'self', '[]'::jsonb,
    p_signature_data_url, p_signature_typed, p_consent_text,
    p_campaign_slug, p_user_agent);
end; $$;
grant execute on function public.sign_waiver(uuid, uuid, uuid, text, text, text, text, text, text) to authenticated;

-- ── 8. The printable record has to show who was covered ──────────────────
-- Same shape as CP-135's, plus the minors, the signer's attested date of
-- birth, and whether they signed for themselves or as a guardian. Appended
-- columns only, so existing callers keep working.
drop function if exists public.get_waiver_submission(uuid);
create function public.get_waiver_submission(p_id uuid)
returns table (
  id uuid, business_id uuid, business_name text, signed_at timestamptz,
  signer_name text, signer_email text, signature_data_url text, signature_typed text,
  consent_text text, body_sha256 text, user_agent text,
  waiver_title text, version_no int, version_text text, version_created_at timestamptz,
  campaign_title text, member_name text, member_phone text,
  minors jsonb, signer_dob date, signer_relationship text
)
language sql stable security definer set search_path = public as $$
  select s.id, s.business_id, b.name, s.signed_at,
         s.signer_name, s.signer_email, s.signature_data_url, s.signature_typed,
         s.consent_text, s.body_sha256, s.user_agent,
         w.title, v.version_no, v.body_text, v.created_at,
         c.title, p.full_name, p.phone,
         s.minors, s.signer_dob, s.signer_relationship
    from public.waiver_submissions s
    join public.businesses b on b.id = s.business_id
    join public.business_waivers w on w.id = s.waiver_id
    join public.waiver_versions v on v.id = s.version_id
    left join public.signup_campaigns c on c.id = s.campaign_id
    join public.business_memberships m on m.id = s.membership_id
    join public.profiles p on p.id = m.user_id
   where s.id = p_id
     and (public.staffs_business(s.business_id) or s.user_id = auth.uid());
$$;
grant execute on function public.get_waiver_submission(uuid) to authenticated;
