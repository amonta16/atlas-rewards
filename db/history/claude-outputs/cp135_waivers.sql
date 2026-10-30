-- ============================================================================
-- CP-135 · Waivers + signup campaigns
-- ----------------------------------------------------------------------------
-- Run in the Supabase SQL editor BEFORE deploying the CP-135 app build.
-- Self-contained: safe to re-run. Apply after cp134.
--
-- Model
--   business_waivers      the waiver itself (title, active, required-at-signup)
--   waiver_versions       IMMUTABLE text of each published version. A signed
--                         record points at the exact version, and versions are
--                         never edited — publishing a change creates a new one.
--   waiver_submissions    who signed what, when: typed name, drawn signature
--                         (PNG data URL, stored inline — ~10–30 KB, private by
--                         RLS, no storage bucket/policy surface to get wrong),
--                         the consent sentence they agreed to, a SHA-256 of the
--                         version text at signing, user agent, timestamp.
--   signup_campaigns      the promotional QR: "Sign the waiver and get 10% off".
--                         Optional waiver, optional reward (points or an offer).
--   campaign_completions  one row per member per campaign — the reward is
--                         issued exactly once, and only by complete_campaign()
--                         after every required step has been recorded.
--
-- Tenant isolation: every table carries business_id; RLS lets staff of THAT
-- business read, customers read only their own rows, and all writes go
-- through SECURITY DEFINER RPCs that re-check membership / staffs_business.
-- ============================================================================

-- ── 1. Tables ────────────────────────────────────────────────────────────
create table if not exists public.business_waivers (
  id                    uuid primary key default uuid_generate_v4(),
  business_id           uuid not null references public.businesses(id) on delete cascade,
  title                 text not null,
  is_active             boolean not null default true,
  required_for_signup   boolean not null default false,   -- gate EVERY new member
  current_version_id    uuid,                              -- set by publish_waiver_version
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists business_waivers_biz_idx on public.business_waivers (business_id, is_active);

create table if not exists public.waiver_versions (
  id            uuid primary key default uuid_generate_v4(),
  waiver_id     uuid not null references public.business_waivers(id) on delete cascade,
  business_id   uuid not null references public.businesses(id) on delete cascade,
  version_no    int  not null,
  body_text     text not null,
  document_url  text,                                      -- optional PDF/image of the paper form
  body_sha256   text not null,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  unique (waiver_id, version_no)
);

create table if not exists public.waiver_submissions (
  id                  uuid primary key default uuid_generate_v4(),
  business_id         uuid not null references public.businesses(id) on delete cascade,
  waiver_id           uuid not null references public.business_waivers(id) on delete cascade,
  version_id          uuid not null references public.waiver_versions(id) on delete restrict,
  membership_id       uuid not null references public.business_memberships(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,
  campaign_id         uuid,                                 -- set below (FK added after campaigns table)
  signer_name         text not null,
  signer_email        text,
  signature_data_url  text,                                 -- drawn signature (PNG data URL)
  signature_typed     text,                                 -- typed full name as signature
  consent_text        text not null,                        -- the exact sentence they ticked
  body_sha256         text not null,                        -- copy of the version hash at signing
  user_agent          text,
  signed_at           timestamptz not null default now()
);
create index if not exists waiver_submissions_biz_idx    on public.waiver_submissions (business_id, signed_at desc);
create index if not exists waiver_submissions_member_idx on public.waiver_submissions (membership_id, signed_at desc);

create table if not exists public.signup_campaigns (
  id             uuid primary key default uuid_generate_v4(),
  business_id    uuid not null references public.businesses(id) on delete cascade,
  slug           text not null,                             -- goes in the QR: /j/CODE?c=<slug>
  title          text not null,                             -- internal name
  headline       text not null,                             -- "Sign the waiver, get 10% off"
  description    text,
  waiver_id      uuid references public.business_waivers(id) on delete set null,
  reward_kind    text not null default 'none' check (reward_kind in ('none','points','offer')),
  points_amount  int,
  offer_id       uuid references public.offers(id) on delete set null,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (business_id, slug)
);

create table if not exists public.campaign_completions (
  id                    uuid primary key default uuid_generate_v4(),
  business_id           uuid not null references public.businesses(id) on delete cascade,
  campaign_id           uuid not null references public.signup_campaigns(id) on delete cascade,
  membership_id         uuid not null references public.business_memberships(id) on delete cascade,
  waiver_submission_id  uuid references public.waiver_submissions(id) on delete set null,
  reward_kind           text not null,
  reward_detail         jsonb,                              -- {points:100} or {offer_id, saved_offer_id, redeem_code}
  completed_at          timestamptz not null default now(),
  unique (campaign_id, membership_id)
);

do $$ begin
  alter table public.waiver_submissions
    add constraint waiver_submissions_campaign_fkey
    foreign key (campaign_id) references public.signup_campaigns(id) on delete set null;
exception when duplicate_object then null; end $$;

-- ── 2. RLS ───────────────────────────────────────────────────────────────
alter table public.business_waivers     enable row level security;
alter table public.waiver_versions      enable row level security;
alter table public.waiver_submissions   enable row level security;
alter table public.signup_campaigns     enable row level security;
alter table public.campaign_completions enable row level security;

do $$ begin
  begin drop policy "waivers_staff_all"        on public.business_waivers;     exception when undefined_object then null; end;
  begin drop policy "waivers_public_read"      on public.business_waivers;     exception when undefined_object then null; end;
  begin drop policy "waiver_versions_staff"    on public.waiver_versions;      exception when undefined_object then null; end;
  begin drop policy "waiver_versions_public"   on public.waiver_versions;      exception when undefined_object then null; end;
  begin drop policy "waiver_subs_staff_read"   on public.waiver_submissions;   exception when undefined_object then null; end;
  begin drop policy "waiver_subs_self_read"    on public.waiver_submissions;   exception when undefined_object then null; end;
  begin drop policy "campaigns_staff_all"      on public.signup_campaigns;     exception when undefined_object then null; end;
  begin drop policy "campaigns_public_read"    on public.signup_campaigns;     exception when undefined_object then null; end;
  begin drop policy "completions_staff_read"   on public.campaign_completions; exception when undefined_object then null; end;
  begin drop policy "completions_self_read"    on public.campaign_completions; exception when undefined_object then null; end;
end $$;

-- Waivers + versions: active text is public (a customer must read it before
-- they can sign it); management is staff-only.
create policy "waivers_public_read" on public.business_waivers for select to public using (is_active);
create policy "waivers_staff_all"   on public.business_waivers for all to authenticated
  using (public.staffs_business(business_id)) with check (public.staffs_business(business_id));
create policy "waiver_versions_public" on public.waiver_versions for select to public using (true);
create policy "waiver_versions_staff"  on public.waiver_versions for all to authenticated
  using (public.staffs_business(business_id)) with check (public.staffs_business(business_id));

-- Signed records: staff of the business, or the signer. No direct writes.
create policy "waiver_subs_staff_read" on public.waiver_submissions for select to authenticated
  using (public.staffs_business(business_id));
create policy "waiver_subs_self_read"  on public.waiver_submissions for select to authenticated
  using (user_id = auth.uid());

create policy "campaigns_public_read" on public.signup_campaigns for select to public using (is_active);
create policy "campaigns_staff_all"   on public.signup_campaigns for all to authenticated
  using (public.staffs_business(business_id)) with check (public.staffs_business(business_id));

create policy "completions_staff_read" on public.campaign_completions for select to authenticated
  using (public.staffs_business(business_id));
create policy "completions_self_read"  on public.campaign_completions for select to authenticated
  using (exists (select 1 from public.business_memberships m where m.id = membership_id and m.user_id = auth.uid()));

-- ── 3. Staff RPCs ────────────────────────────────────────────────────────
drop function if exists public.upsert_waiver(uuid, uuid, text, boolean, boolean);
create function public.upsert_waiver(
  p_id uuid, p_business_id uuid, p_title text, p_is_active boolean, p_required_for_signup boolean
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.staffs_business(p_business_id) then raise exception 'permission denied'; end if;
  if nullif(btrim(p_title), '') is null then raise exception 'title required'; end if;
  if p_id is null then
    insert into public.business_waivers (business_id, title, is_active, required_for_signup)
    values (p_business_id, btrim(p_title), coalesce(p_is_active, true), coalesce(p_required_for_signup, false))
    returning id into v_id;
  else
    update public.business_waivers
       set title = btrim(p_title), is_active = coalesce(p_is_active, true),
           required_for_signup = coalesce(p_required_for_signup, false), updated_at = now()
     where id = p_id and business_id = p_business_id
    returning id into v_id;
    if v_id is null then raise exception 'waiver not found'; end if;
  end if;
  return v_id;
end; $$;
grant execute on function public.upsert_waiver(uuid, uuid, text, boolean, boolean) to authenticated;

-- Publishing NEVER edits an existing version: it appends version N+1 and
-- points the waiver at it. Old submissions keep pointing at their version.
drop function if exists public.publish_waiver_version(uuid, uuid, text, text);
create function public.publish_waiver_version(
  p_waiver_id uuid, p_business_id uuid, p_body_text text, p_document_url text
)
returns table (version_id uuid, version_no int)
language plpgsql security definer set search_path = public, extensions as $$
declare v_no int; v_id uuid;
begin
  if not public.staffs_business(p_business_id) then raise exception 'permission denied'; end if;
  if not exists (select 1 from public.business_waivers w where w.id = p_waiver_id and w.business_id = p_business_id) then
    raise exception 'waiver not found';
  end if;
  if length(coalesce(btrim(p_body_text), '')) < 20 then raise exception 'waiver text is too short'; end if;

  select coalesce(max(v.version_no), 0) + 1 into v_no from public.waiver_versions v where v.waiver_id = p_waiver_id;
  insert into public.waiver_versions (waiver_id, business_id, version_no, body_text, document_url, body_sha256, created_by)
  values (p_waiver_id, p_business_id, v_no, p_body_text, nullif(btrim(p_document_url), ''),
          encode(digest(p_body_text, 'sha256'), 'hex'), auth.uid())
  returning id into v_id;

  update public.business_waivers set current_version_id = v_id, updated_at = now() where id = p_waiver_id;
  return query select v_id, v_no;
end; $$;
grant execute on function public.publish_waiver_version(uuid, uuid, text, text) to authenticated;

drop function if exists public.upsert_signup_campaign(uuid, uuid, text, text, text, text, uuid, text, int, uuid, boolean);
create function public.upsert_signup_campaign(
  p_id uuid, p_business_id uuid, p_slug text, p_title text, p_headline text, p_description text,
  p_waiver_id uuid, p_reward_kind text, p_points_amount int, p_offer_id uuid, p_is_active boolean
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_slug text;
begin
  if not public.staffs_business(p_business_id) then raise exception 'permission denied'; end if;
  v_slug := lower(regexp_replace(coalesce(p_slug, ''), '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);
  if length(v_slug) < 2 then raise exception 'campaign link name must be at least 2 characters'; end if;
  if nullif(btrim(p_headline), '') is null then raise exception 'headline required'; end if;
  if p_reward_kind not in ('none', 'points', 'offer') then raise exception 'bad reward kind'; end if;
  if p_reward_kind = 'points' and coalesce(p_points_amount, 0) <= 0 then raise exception 'points must be above 0'; end if;
  if p_reward_kind = 'offer' and p_offer_id is null then raise exception 'pick an offer'; end if;
  if p_offer_id is not null and not exists (select 1 from public.offers o where o.id = p_offer_id and o.business_id = p_business_id) then
    raise exception 'that offer belongs to another business';
  end if;
  if p_waiver_id is not null and not exists (select 1 from public.business_waivers w where w.id = p_waiver_id and w.business_id = p_business_id) then
    raise exception 'that waiver belongs to another business';
  end if;

  if p_id is null then
    insert into public.signup_campaigns
      (business_id, slug, title, headline, description, waiver_id, reward_kind, points_amount, offer_id, is_active)
    values
      (p_business_id, v_slug, coalesce(nullif(btrim(p_title), ''), p_headline), btrim(p_headline), p_description,
       p_waiver_id, p_reward_kind, p_points_amount, p_offer_id, coalesce(p_is_active, true))
    returning id into v_id;
  else
    update public.signup_campaigns set
      slug = v_slug, title = coalesce(nullif(btrim(p_title), ''), p_headline), headline = btrim(p_headline),
      description = p_description, waiver_id = p_waiver_id, reward_kind = p_reward_kind,
      points_amount = p_points_amount, offer_id = p_offer_id, is_active = coalesce(p_is_active, true), updated_at = now()
    where id = p_id and business_id = p_business_id
    returning id into v_id;
    if v_id is null then raise exception 'campaign not found'; end if;
  end if;
  return v_id;
end; $$;
grant execute on function public.upsert_signup_campaign(uuid, uuid, text, text, text, text, uuid, text, int, uuid, boolean) to authenticated;

drop function if exists public.delete_signup_campaign(uuid, uuid);
create function public.delete_signup_campaign(p_id uuid, p_business_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.staffs_business(p_business_id) then raise exception 'permission denied'; end if;
  delete from public.signup_campaigns where id = p_id and business_id = p_business_id;
end; $$;
grant execute on function public.delete_signup_campaign(uuid, uuid) to authenticated;

-- Submissions list for the portal: search + filter + paging.
drop function if exists public.list_waiver_submissions(uuid, text, uuid, timestamptz, timestamptz, int, int);
create function public.list_waiver_submissions(
  p_business_id uuid, p_q text default null, p_waiver_id uuid default null,
  p_from timestamptz default null, p_to timestamptz default null,
  p_limit int default 50, p_offset int default 0
)
returns table (
  id uuid, signed_at timestamptz, signer_name text, signer_email text,
  member_name text, member_phone text, membership_id uuid,
  waiver_id uuid, waiver_title text, version_id uuid, version_no int,
  campaign_id uuid, campaign_title text, has_signature boolean, total_count bigint
)
language sql stable security definer set search_path = public as $$
  with base as (
    select s.*, w.title as w_title, v.version_no as v_no, c.title as c_title,
           p.full_name as m_name, p.phone as m_phone
      from public.waiver_submissions s
      join public.business_waivers w on w.id = s.waiver_id
      join public.waiver_versions v on v.id = s.version_id
      left join public.signup_campaigns c on c.id = s.campaign_id
      join public.business_memberships m on m.id = s.membership_id
      join public.profiles p on p.id = m.user_id
     where s.business_id = p_business_id
       and public.staffs_business(p_business_id)
       and (p_waiver_id is null or s.waiver_id = p_waiver_id)
       and (p_from is null or s.signed_at >= p_from)
       and (p_to   is null or s.signed_at <  p_to)
       and (nullif(btrim(p_q), '') is null
            or s.signer_name ilike '%' || btrim(p_q) || '%'
            or coalesce(p.full_name, '') ilike '%' || btrim(p_q) || '%'
            or coalesce(p.email::text, '') ilike '%' || btrim(p_q) || '%'
            or regexp_replace(coalesce(p.phone, ''), '\D', '', 'g') like '%' || regexp_replace(btrim(p_q), '\D', '', 'g') || '%'
               and length(regexp_replace(btrim(p_q), '\D', '', 'g')) >= 4)
  )
  select b.id, b.signed_at, b.signer_name, b.signer_email,
         b.m_name, b.m_phone, b.membership_id,
         b.waiver_id, b.w_title, b.version_id, b.v_no,
         b.campaign_id, b.c_title, (b.signature_data_url is not null),
         count(*) over () as total_count
    from base b
   order by b.signed_at desc
   limit greatest(1, least(p_limit, 200)) offset greatest(0, p_offset);
$$;
grant execute on function public.list_waiver_submissions(uuid, text, uuid, timestamptz, timestamptz, int, int) to authenticated;

-- One signed record in full (for the printable view). Staff of the business
-- or the signer themself.
drop function if exists public.get_waiver_submission(uuid);
create function public.get_waiver_submission(p_id uuid)
returns table (
  id uuid, business_id uuid, business_name text, signed_at timestamptz,
  signer_name text, signer_email text, signature_data_url text, signature_typed text,
  consent_text text, body_sha256 text, user_agent text,
  waiver_title text, version_no int, version_text text, version_created_at timestamptz,
  campaign_title text, member_name text, member_phone text
)
language sql stable security definer set search_path = public as $$
  select s.id, s.business_id, b.name, s.signed_at,
         s.signer_name, s.signer_email, s.signature_data_url, s.signature_typed,
         s.consent_text, s.body_sha256, s.user_agent,
         w.title, v.version_no, v.body_text, v.created_at,
         c.title, p.full_name, p.phone
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

-- Front desk: is this member covered? (latest signature per active waiver,
-- and whether it's on the CURRENT version).
drop function if exists public.member_waiver_status(uuid);
create function public.member_waiver_status(p_membership_id uuid)
returns table (
  waiver_id uuid, waiver_title text, required_for_signup boolean,
  signed_at timestamptz, signed_version_no int, current_version_no int, is_current boolean, submission_id uuid
)
language sql stable security definer set search_path = public as $$
  select w.id, w.title, w.required_for_signup,
         s.signed_at, sv.version_no, cv.version_no,
         (s.version_id is not null and s.version_id = w.current_version_id), s.id
    from public.business_memberships m
    join public.business_waivers w on w.business_id = m.business_id and w.is_active
    left join lateral (
      select x.* from public.waiver_submissions x
       where x.membership_id = m.id and x.waiver_id = w.id
       order by x.signed_at desc limit 1
    ) s on true
    left join public.waiver_versions sv on sv.id = s.version_id
    left join public.waiver_versions cv on cv.id = w.current_version_id
   where m.id = p_membership_id
     and public.staffs_business(m.business_id)
   order by w.required_for_signup desc, w.title;
$$;
grant execute on function public.member_waiver_status(uuid) to authenticated;

-- ── 4. Customer RPCs ─────────────────────────────────────────────────────
-- What a campaign QR shows before/after signup (public — the landing page
-- runs before the customer has an account).
drop function if exists public.get_signup_campaign(uuid, text);
create function public.get_signup_campaign(p_business_id uuid, p_slug text)
returns table (
  id uuid, slug text, headline text, description text,
  reward_kind text, points_amount int, offer_id uuid, offer_title text,
  waiver_id uuid, waiver_title text, version_id uuid, version_no int, body_text text, document_url text
)
language sql stable security definer set search_path = public as $$
  select c.id, c.slug, c.headline, c.description,
         c.reward_kind, c.points_amount, c.offer_id, o.title,
         w.id, w.title, v.id, v.version_no, v.body_text, v.document_url
    from public.signup_campaigns c
    left join public.offers o on o.id = c.offer_id
    left join public.business_waivers w on w.id = c.waiver_id and w.is_active
    left join public.waiver_versions v on v.id = w.current_version_id
   where c.business_id = p_business_id and c.is_active
     and lower(c.slug) = lower(p_slug);
$$;
grant execute on function public.get_signup_campaign(uuid, text) to anon, authenticated;

-- The business's required-at-signup waiver (if any) with its current text.
drop function if exists public.required_waiver_for_business(uuid);
create function public.required_waiver_for_business(p_business_id uuid)
returns table (waiver_id uuid, waiver_title text, version_id uuid, version_no int, body_text text, document_url text)
language sql stable security definer set search_path = public as $$
  select w.id, w.title, v.id, v.version_no, v.body_text, v.document_url
    from public.business_waivers w
    join public.waiver_versions v on v.id = w.current_version_id
   where w.business_id = p_business_id and w.is_active and w.required_for_signup
   order by w.created_at
   limit 1;
$$;
grant execute on function public.required_waiver_for_business(uuid) to anon, authenticated;

-- My own waiver status at this business.
drop function if exists public.my_waiver_status(uuid);
create function public.my_waiver_status(p_business_id uuid)
returns table (waiver_id uuid, waiver_title text, required_for_signup boolean, signed_at timestamptz, is_current boolean)
language sql stable security definer set search_path = public as $$
  select w.id, w.title, w.required_for_signup, s.signed_at,
         (s.version_id is not null and s.version_id = w.current_version_id)
    from public.business_memberships m
    join public.business_waivers w on w.business_id = m.business_id and w.is_active
    left join lateral (
      select x.* from public.waiver_submissions x
       where x.membership_id = m.id and x.waiver_id = w.id
       order by x.signed_at desc limit 1
    ) s on true
   where m.business_id = p_business_id and m.user_id = auth.uid();
$$;
grant execute on function public.my_waiver_status(uuid) to authenticated;

-- Sign. Records the submission against the EXACT version the customer saw
-- (the client sends version_id; we refuse if it isn't the current one so
-- nobody signs stale text). Then, if a campaign is named, completes it and
-- issues the reward — exactly once per member per campaign.
drop function if exists public.sign_waiver(uuid, uuid, uuid, text, text, text, text, text, text);
create function public.sign_waiver(
  p_business_id       uuid,
  p_waiver_id         uuid,
  p_version_id        uuid,
  p_signer_name       text,
  p_signature_data_url text,
  p_signature_typed   text,
  p_consent_text      text,
  p_campaign_slug     text,
  p_user_agent        text
)
returns table (submission_id uuid, campaign_completed boolean, reward_kind text, reward_points int, reward_code text, reward_offer_title text)
language plpgsql security definer set search_path = public as $$
declare
  v_membership_id uuid;
  v_email         text;
  v_hash          text;
  v_current       uuid;
  v_sub_id        uuid;
  v_camp          record;
  v_completed     boolean := false;
  v_kind          text := 'none';
  v_points        int := null;
  v_code          text := null;
  v_offer_title   text := null;
  v_saved_id      uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  select m.id into v_membership_id
    from public.business_memberships m
   where m.business_id = p_business_id and m.user_id = auth.uid();
  if v_membership_id is null then raise exception 'join this business first'; end if;

  select w.current_version_id into v_current
    from public.business_waivers w
   where w.id = p_waiver_id and w.business_id = p_business_id and w.is_active;
  if v_current is null then raise exception 'waiver not found'; end if;
  if v_current <> p_version_id then raise exception 'this waiver was updated — please reload and sign the latest version'; end if;

  if length(coalesce(btrim(p_signer_name), '')) < 2 then raise exception 'please enter your full name'; end if;
  if nullif(btrim(p_consent_text), '') is null then raise exception 'consent required'; end if;
  if nullif(p_signature_data_url, '') is null and length(coalesce(btrim(p_signature_typed), '')) < 2 then
    raise exception 'please sign (draw or type your name)';
  end if;

  select v.body_sha256 into v_hash from public.waiver_versions v where v.id = p_version_id;
  select p.email::text into v_email from public.profiles p where p.id = auth.uid();

  -- Campaign (optional) — resolved BEFORE inserting so the submission links to it.
  if nullif(btrim(p_campaign_slug), '') is not null then
    select c.* into v_camp
      from public.signup_campaigns c
     where c.business_id = p_business_id and c.is_active and lower(c.slug) = lower(btrim(p_campaign_slug));
  end if;

  insert into public.waiver_submissions
    (business_id, waiver_id, version_id, membership_id, user_id, campaign_id,
     signer_name, signer_email, signature_data_url, signature_typed, consent_text, body_sha256, user_agent)
  values
    (p_business_id, p_waiver_id, p_version_id, v_membership_id, auth.uid(), v_camp.id,
     btrim(p_signer_name), v_email, nullif(p_signature_data_url, ''), nullif(btrim(p_signature_typed), ''),
     btrim(p_consent_text), v_hash, left(p_user_agent, 400))
  returning id into v_sub_id;

  -- Complete the campaign + issue the reward, once.
  if v_camp.id is not null then
    if not exists (select 1 from public.campaign_completions cc where cc.campaign_id = v_camp.id and cc.membership_id = v_membership_id) then
      v_kind := v_camp.reward_kind;
      if v_kind = 'points' then
        v_points := v_camp.points_amount;
        perform public.award_points(
          v_membership_id, v_points, 'signup_campaign', v_camp.id,
          'campaign_' || v_camp.id::text || '_' || v_membership_id::text,
          'Signup reward: ' || v_camp.headline
        );
      elsif v_kind = 'offer' then
        -- save_offer runs as the caller (auth.uid() = this customer) and mints a desk code.
        v_saved_id := public.save_offer(v_camp.offer_id);
        select so.redeem_code, o.title into v_code, v_offer_title
          from public.customer_saved_offers so join public.offers o on o.id = so.offer_id
         where so.id = v_saved_id;
      end if;
      insert into public.campaign_completions
        (business_id, campaign_id, membership_id, waiver_submission_id, reward_kind, reward_detail)
      values
        (p_business_id, v_camp.id, v_membership_id, v_sub_id, v_kind,
         case when v_kind = 'points' then jsonb_build_object('points', v_points)
              when v_kind = 'offer'  then jsonb_build_object('offer_id', v_camp.offer_id, 'saved_offer_id', v_saved_id, 'redeem_code', v_code)
              else '{}'::jsonb end);
      v_completed := true;
    end if;
  end if;

  return query select v_sub_id, v_completed, v_kind, v_points, v_code, v_offer_title;
end; $$;
grant execute on function public.sign_waiver(uuid, uuid, uuid, text, text, text, text, text, text) to authenticated;

-- A campaign WITHOUT a waiver still needs a completion path (account → reward).
drop function if exists public.complete_signup_campaign(uuid, text);
create function public.complete_signup_campaign(p_business_id uuid, p_campaign_slug text)
returns table (campaign_completed boolean, reward_kind text, reward_points int, reward_code text, reward_offer_title text)
language plpgsql security definer set search_path = public as $$
declare
  v_membership_id uuid; v_camp record; v_points int; v_code text; v_offer_title text; v_saved_id uuid; v_kind text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select m.id into v_membership_id from public.business_memberships m
   where m.business_id = p_business_id and m.user_id = auth.uid();
  if v_membership_id is null then raise exception 'join this business first'; end if;

  select c.* into v_camp from public.signup_campaigns c
   where c.business_id = p_business_id and c.is_active and lower(c.slug) = lower(btrim(p_campaign_slug));
  if v_camp.id is null then raise exception 'campaign not found'; end if;
  if v_camp.waiver_id is not null then
    -- Must sign first; sign_waiver() completes it.
    if not exists (select 1 from public.waiver_submissions s
                    where s.membership_id = v_membership_id and s.waiver_id = v_camp.waiver_id) then
      raise exception 'waiver required';
    end if;
  end if;
  if exists (select 1 from public.campaign_completions cc where cc.campaign_id = v_camp.id and cc.membership_id = v_membership_id) then
    return query select false, v_camp.reward_kind, null::int, null::text, null::text; return;
  end if;

  v_kind := v_camp.reward_kind;
  if v_kind = 'points' then
    v_points := v_camp.points_amount;
    perform public.award_points(v_membership_id, v_points, 'signup_campaign', v_camp.id,
      'campaign_' || v_camp.id::text || '_' || v_membership_id::text, 'Signup reward: ' || v_camp.headline);
  elsif v_kind = 'offer' then
    v_saved_id := public.save_offer(v_camp.offer_id);
    select so.redeem_code, o.title into v_code, v_offer_title
      from public.customer_saved_offers so join public.offers o on o.id = so.offer_id where so.id = v_saved_id;
  end if;
  insert into public.campaign_completions (business_id, campaign_id, membership_id, reward_kind, reward_detail)
  values (p_business_id, v_camp.id, v_membership_id, v_kind,
          case when v_kind = 'points' then jsonb_build_object('points', v_points)
               when v_kind = 'offer'  then jsonb_build_object('offer_id', v_camp.offer_id, 'saved_offer_id', v_saved_id, 'redeem_code', v_code)
               else '{}'::jsonb end);
  return query select true, v_kind, v_points, v_code, v_offer_title;
end; $$;
grant execute on function public.complete_signup_campaign(uuid, text) to authenticated;

-- ── verify ──────────────────────────────────────────────────────────────
-- select * from public.list_waiver_submissions('<business uuid>');
