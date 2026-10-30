-- ============================================================================
-- CP-144 — the signer gets to say where their copy goes
-- ============================================================================
-- CP-144 rebuilds the customer waiver screen as a ROLLER-style stepped form:
-- email → your details → who this covers → the document + signature. The first
-- step needs somewhere to put what it collects.
--
-- Until now sign_waiver_v2 read the address off profiles.email and ignored
-- whatever the form had. That is not wrong — every existing row has an email —
-- but it is the ACCOUNT address, which is often a parent's login, an old
-- address, or the one they used to sign up on a kiosk two years ago. The
-- signed copy is a legal artifact under E-SIGN; the signer should be able to
-- say where it lands.
--
-- So: one new trailing parameter, p_signer_email. Null or blank falls back to
-- the profile exactly as before, so an older client that does not send it is
-- byte-identical in behaviour. Nothing about this migration can regress a
-- submission that already works.
--
-- Drop-and-recreate rather than CREATE OR REPLACE: adding a trailing DEFAULT
-- argument leaves the 12-arg signature in place, and PostgREST then sees two
-- candidates for the same call and refuses with "could not choose the best
-- candidate function". CP-140 learned this the hard way on
-- upsert_mystery_prize.
--
-- Idempotent: safe to run twice.
-- ============================================================================

begin;

drop function if exists public.sign_waiver_v2(uuid, uuid, uuid, text, date, text, jsonb, text, text, text, text, text);
drop function if exists public.sign_waiver_v2(uuid, uuid, uuid, text, date, text, jsonb, text, text, text, text, text, text);

create function public.sign_waiver_v2(
  p_business_id       uuid,
  p_waiver_id         uuid,
  p_version_id        uuid,
  p_signer_name       text,
  p_signer_dob        date,
  p_relationship      text,
  p_minors            jsonb,
  p_signature_data_url text,
  p_signature_typed   text,
  p_consent_text      text,
  p_campaign_slug     text,
  p_user_agent        text,
  p_signer_email      text default null      -- CP-144
)
returns table(
  submission_id uuid, campaign_completed boolean, reward_kind text,
  reward_points integer, reward_code text, reward_offer_title text
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_membership_id uuid;
  v_email   text;
  v_hash    text;
  v_current uuid;
  v_sub_id  uuid;
  v_camp    record;
  v_camp_id uuid := null;          -- see the CP-135 hotfix
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

  -- CP-144: the form's address wins when there is one; the account address is
  -- the fallback, which is what every pre-CP-144 row used. Lower-cased and
  -- trimmed, and sanity-checked for a shape that could plausibly receive mail —
  -- a typo here means the signer silently never gets their copy, so a bad one
  -- falls back rather than being stored.
  v_email := nullif(btrim(lower(coalesce(p_signer_email, ''))), '');
  if v_email is not null and (v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' or length(v_email) > 254) then
    v_email := null;
  end if;
  if v_email is null then
    select p.email::text into v_email from public.profiles p where p.id = auth.uid();
  end if;

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
end; $function$;

-- CP-138 lockdown posture: signed-in customers only. A fresh CREATE gets the
-- default PUBLIC grant, which anon inherits, so it has to come straight back off.
revoke all on function public.sign_waiver_v2(uuid, uuid, uuid, text, date, text, jsonb, text, text, text, text, text, text) from public, anon;
grant execute on function public.sign_waiver_v2(uuid, uuid, uuid, text, date, text, jsonb, text, text, text, text, text, text) to authenticated;

commit;
