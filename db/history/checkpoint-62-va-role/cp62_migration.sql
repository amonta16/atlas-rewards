-- =====================================================================
-- CHECKPOINT 62 — VA (Virtual Assistant) agency role
-- =====================================================================
-- A new agency-side role, `agency_va`, that has the SAME reach as an
-- agency_admin over the Apps deck (create businesses, open/edit them,
-- organize folders) but is DELIBERATELY restricted:
--
--   • CANNOT delete a business. Instead it files a "delete request"
--     (with a required reason note) that an agency_admin must approve.
--   • CANNOT see the agency-portal Analytics, Pipeline, Team, or
--     Settings tabs (enforced in the app's route guards + sidebar).
--
-- This migration handles the DATABASE half:
--   1. is_agency_va() / is_agency_staff() helpers.
--   2. Open create_business + save_business_baseline to VA (staff).
--   3. RLS so a VA can read/insert/update businesses + folders, but the
--      DELETE policy stays admin-only.
--   4. business_delete_requests table + request/list/approve/reject RPCs.
--   5. Teach the invite RPCs about the agency_va role (admin-only invite).
--
-- Apply AFTER cp60. Idempotent — safe to re-run.
-- =====================================================================


-- =====================================================================
-- 0. WIDEN THE role CHECK CONSTRAINTS TO ALLOW 'agency_va'
-- =====================================================================
-- business_users.role and pending_invitations.role were both created
-- with CHECK (role IN ('agency_admin','business_manager','business_staff')).
-- Without widening these, inserting an agency_va row fails. Drop the old
-- constraint (auto-named <table>_role_check) and re-add with the new value.
-- =====================================================================
alter table public.business_users      drop constraint if exists business_users_role_check;
alter table public.business_users
  add  constraint business_users_role_check
  check (role in ('agency_admin','agency_va','business_manager','business_staff'));

alter table public.pending_invitations drop constraint if exists pending_invitations_role_check;
alter table public.pending_invitations
  add  constraint pending_invitations_role_check
  check (role in ('agency_admin','agency_va','business_manager','business_staff'));


-- =====================================================================
-- 1. ROLE HELPERS
-- =====================================================================
-- is_agency_va()   → caller holds an agency_va row.
-- is_agency_staff()→ caller is agency_admin OR agency_va (anyone with
--                    agency-portal reach). Use this for "admins and VAs
--                    can both do X" gates; keep is_agency_admin() for the
--                    admin-only bits (delete, analytics, approvals).
-- =====================================================================
create or replace function public.is_agency_va()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.business_users
     where user_id = auth.uid() and role = 'agency_va'
  );
$$;

create or replace function public.is_agency_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_agency_admin() or public.is_agency_va();
$$;

grant execute on function public.is_agency_va()    to authenticated;
grant execute on function public.is_agency_staff() to authenticated;


-- =====================================================================
-- 2. OPEN create_business + save_business_baseline TO STAFF (admin + VA)
-- =====================================================================
-- Both were is_agency_admin()-only. A VA needs to spin up new apps, so
-- swap the gate to is_agency_staff(). Everything else is unchanged.
-- =====================================================================
create or replace function public.create_business(
  p_name           text,
  p_slug           text,
  p_industry       text     default null,
  p_widget_config  jsonb    default null,
  p_point_rules    jsonb    default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id   uuid;
  v_slug citext := lower(regexp_replace(p_slug, '[^a-z0-9-]+', '-', 'gi'));
begin
  if not public.is_agency_staff() then
    raise exception 'only agency admins or VAs can create businesses';
  end if;
  if v_slug = '' or length(v_slug) < 2 then
    raise exception 'slug must be at least 2 characters';
  end if;
  if exists (select 1 from public.businesses where slug = v_slug) then
    raise exception 'slug "%" is already taken', v_slug;
  end if;

  insert into public.businesses (slug, name, industry, status, widget_config, point_rules)
       values (
         v_slug, p_name, p_industry, 'active',
         coalesce(p_widget_config,
           (select column_default::jsonb from information_schema.columns
             where table_schema = 'public' and table_name = 'businesses'
               and column_name = 'widget_config')),
         coalesce(p_point_rules,
           (select column_default::jsonb from information_schema.columns
             where table_schema = 'public' and table_name = 'businesses'
               and column_name = 'point_rules'))
       )
    returning id into v_id;

  return v_id;
end; $$;
grant execute on function public.create_business(text, text, text, jsonb, jsonb) to authenticated;

-- Baseline capture (6-arg cp50 signature) — same swap.
create or replace function public.save_business_baseline(
  p_business_id            uuid,
  p_google_review_count    int,
  p_google_rating          numeric,
  p_monthly_revenue_cents  bigint,
  p_monthly_visits         int,
  p_avg_ticket_cents       bigint default null
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_agency_staff() then
    raise exception 'only agency admins or VAs can update business baseline';
  end if;

  update public.businesses
     set baseline_google_review_count   = p_google_review_count,
         baseline_google_rating         = p_google_rating,
         baseline_monthly_revenue_cents = p_monthly_revenue_cents,
         baseline_monthly_visits        = p_monthly_visits,
         baseline_avg_ticket_cents      = p_avg_ticket_cents,
         baseline_captured_at           = now()
   where id = p_business_id;
end; $$;
grant execute on function public.save_business_baseline(uuid, int, numeric, bigint, int, bigint) to authenticated;


-- =====================================================================
-- 3. RLS — let VA read/insert/update businesses + folders (NO delete)
-- =====================================================================
-- The original CP-01 `biz_manage_admin` policy is `FOR ALL` to admins;
-- that keeps admin's DELETE. We ADD staff-scoped SELECT/INSERT/UPDATE
-- policies (RLS is permissive → these OR together with the existing
-- ones). No staff DELETE policy is added, so a VA's delete is denied at
-- the row level even if it somehow reached the table.
-- =====================================================================
drop policy if exists biz_select_staff on public.businesses;
create policy biz_select_staff on public.businesses for select
  using (public.is_agency_staff());

drop policy if exists biz_insert_staff on public.businesses;
create policy biz_insert_staff on public.businesses for insert
  with check (public.is_agency_staff());

drop policy if exists biz_update_staff on public.businesses;
create policy biz_update_staff on public.businesses for update
  using (public.is_agency_staff()) with check (public.is_agency_staff());

-- Folders: replace the admin-only policy with a staff one (VAs file apps).
do $$ begin
  begin drop policy "folders_agency_all" on public.business_folders; exception when undefined_object then null; end;
end $$;
create policy "folders_agency_all" on public.business_folders
  for all to authenticated
  using      (public.is_agency_staff())
  with check (public.is_agency_staff());


-- =====================================================================
-- 4. BUSINESS DELETE REQUESTS
-- =====================================================================
-- A VA can't delete; it files a request with a required reason. Admins
-- review them on the Apps page and approve (→ the business is deleted)
-- or reject (with an optional note).
-- =====================================================================
create table if not exists public.business_delete_requests (
  id                 uuid primary key default gen_random_uuid(),
  business_id        uuid references public.businesses(id) on delete cascade,
  business_name      text not null,          -- snapshot (survives the delete)
  business_slug      text,                   -- snapshot
  reason             text not null,
  status             text not null default 'pending'
                        check (status in ('pending','approved','rejected')),
  requested_by       uuid default auth.uid(),
  requested_by_email text,
  reviewed_by        uuid,
  reviewed_at        timestamptz,
  review_note        text,
  created_at         timestamptz not null default now()
);
create index if not exists bdr_status_idx  on public.business_delete_requests(status, created_at desc);
create index if not exists bdr_biz_idx     on public.business_delete_requests(business_id);

alter table public.business_delete_requests enable row level security;

-- Admins see everything; a VA sees only its own requests.
drop policy if exists bdr_select on public.business_delete_requests;
create policy bdr_select on public.business_delete_requests for select
  using (public.is_agency_admin() or requested_by = auth.uid());

-- Writes go exclusively through the SECURITY DEFINER RPCs below, so no
-- direct INSERT/UPDATE/DELETE policies are granted.


-- ---------------------------------------------------------------------
-- 4a. request_business_delete(business_id, reason) — staff files a request
-- ---------------------------------------------------------------------
-- Reason is required (min 3 non-blank chars). Re-filing for a business
-- that already has a pending request just refreshes that request's
-- reason instead of stacking duplicates.
-- ---------------------------------------------------------------------
create or replace function public.request_business_delete(
  p_business_id uuid,
  p_reason      text
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_caller uuid := auth.uid();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_name   text;
  v_slug   text;
  v_email  text;
  v_id     uuid;
begin
  if v_caller is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_agency_staff() then
    raise exception 'only agency staff can request a deletion';
  end if;
  if length(v_reason) < 3 then
    raise exception 'a reason is required to request a deletion';
  end if;

  select name, slug into v_name, v_slug from public.businesses where id = p_business_id;
  if v_name is null then
    raise exception 'business not found';
  end if;

  select email into v_email from public.profiles where id = v_caller;

  -- Refresh an existing pending request rather than duplicating it.
  update public.business_delete_requests
     set reason = v_reason, created_at = now(), requested_by = v_caller,
         requested_by_email = v_email
   where business_id = p_business_id and status = 'pending'
  returning id into v_id;

  if v_id is null then
    insert into public.business_delete_requests
      (business_id, business_name, business_slug, reason, requested_by, requested_by_email)
    values
      (p_business_id, v_name, v_slug, v_reason, v_caller, v_email)
    returning id into v_id;
  end if;

  return v_id;
end; $$;
grant execute on function public.request_business_delete(uuid, text) to authenticated;


-- ---------------------------------------------------------------------
-- 4b. list_business_delete_requests() — admin: all; VA: own
-- ---------------------------------------------------------------------
create or replace function public.list_business_delete_requests()
returns table (
  id                 uuid,
  business_id        uuid,
  business_name      text,
  business_slug      text,
  reason             text,
  status             text,
  requested_by       uuid,
  requested_by_email text,
  reviewed_by        uuid,
  reviewed_at        timestamptz,
  review_note        text,
  created_at         timestamptz
)
language sql stable security definer set search_path = public as $$
  select r.id, r.business_id, r.business_name, r.business_slug, r.reason,
         r.status, r.requested_by, r.requested_by_email, r.reviewed_by,
         r.reviewed_at, r.review_note, r.created_at
    from public.business_delete_requests r
   where public.is_agency_admin() or r.requested_by = auth.uid()
   order by (r.status = 'pending') desc, r.created_at desc;
$$;
grant execute on function public.list_business_delete_requests() to authenticated;


-- ---------------------------------------------------------------------
-- 4c. approve_business_delete(request_id) — admin only, performs delete
-- ---------------------------------------------------------------------
-- Deletes the business (same cascade as delete_business) and marks the
-- request approved. The snapshot columns keep the request readable after
-- the business row is gone.
-- ---------------------------------------------------------------------
create or replace function public.approve_business_delete(p_request_id uuid)
returns table (deleted_business_id uuid, deleted_business_name text)
language plpgsql security definer set search_path = public as $$
declare
  v_biz  uuid;
  v_name text;
  v_stat text;
begin
  if not public.is_agency_admin() then
    raise exception 'only agency_admin can approve a deletion';
  end if;

  select business_id, business_name, status
    into v_biz, v_name, v_stat
    from public.business_delete_requests
   where id = p_request_id
   for update;

  if v_name is null then
    raise exception 'delete request not found';
  end if;
  if v_stat <> 'pending' then
    raise exception 'request already %', v_stat;
  end if;

  -- Business may already be gone (manual delete) — tolerate that.
  if v_biz is not null then
    delete from public.businesses where id = v_biz;
  end if;

  update public.business_delete_requests
     set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_request_id;

  return query select v_biz, v_name;
end; $$;
grant execute on function public.approve_business_delete(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 4d. reject_business_delete(request_id, note) — admin only
-- ---------------------------------------------------------------------
create or replace function public.reject_business_delete(
  p_request_id uuid,
  p_note       text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_stat text;
begin
  if not public.is_agency_admin() then
    raise exception 'only agency_admin can reject a deletion';
  end if;

  select status into v_stat
    from public.business_delete_requests
   where id = p_request_id for update;

  if v_stat is null then
    raise exception 'delete request not found';
  end if;
  if v_stat <> 'pending' then
    raise exception 'request already %', v_stat;
  end if;

  update public.business_delete_requests
     set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(),
         review_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_request_id;
end; $$;
grant execute on function public.reject_business_delete(uuid, text) to authenticated;


-- =====================================================================
-- 5. TEACH THE INVITE RPCs ABOUT agency_va
-- =====================================================================
-- Only an agency_admin may create an agency_va. Like agency_admin, the
-- role is NOT business-scoped (business_id stays null).
-- =====================================================================

-- 5a. team_invite_precheck — allow agency_va (admin-only), no business.
create or replace function public.team_invite_precheck(
  p_email       text,
  p_role        text,
  p_business_id uuid
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_caller uuid := auth.uid();
  v_email  text := lower(btrim(p_email));
  v_uid    uuid;
begin
  if v_caller is null then
    raise exception 'not authenticated';
  end if;

  if p_role not in ('agency_admin','agency_va','business_manager','business_staff') then
    raise exception 'invalid role: %', p_role;
  end if;
  -- agency_admin + agency_va are agency-wide (no business); the two
  -- business roles require a business_id.
  if p_role in ('business_manager','business_staff') and p_business_id is null then
    raise exception 'business_id required for role %', p_role;
  end if;

  if exists (
    select 1 from public.business_users bu
     where bu.user_id = v_caller and bu.role = 'agency_admin'
  ) then
    null;                              -- agency_admin: anything
  elsif p_role in ('business_manager','business_staff')
        and p_business_id is not null
        and exists (
          select 1 from public.business_users bu
           where bu.user_id = v_caller and bu.role = 'business_manager'
             and bu.business_id = p_business_id
        )
  then
    null;                              -- manager: own business, mgr/front-desk
  else
    raise exception 'permission denied for role %', p_role;
  end if;

  select u.id into v_uid from auth.users u where lower(u.email::text) = v_email;
  return v_uid;
end; $$;
grant execute on function public.team_invite_precheck(text, text, uuid) to authenticated;


-- 5b. attach_team_role — same allow-list update.
create or replace function public.attach_team_role(
  p_user_id     uuid,
  p_role        text,
  p_business_id uuid,
  p_full_name   text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_caller uuid := auth.uid();
  v_email  text;
begin
  if v_caller is null then
    raise exception 'not authenticated';
  end if;

  if p_role not in ('agency_admin','agency_va','business_manager','business_staff') then
    raise exception 'invalid role: %', p_role;
  end if;

  if exists (
    select 1 from public.business_users bu
     where bu.user_id = v_caller and bu.role = 'agency_admin'
  ) then
    null;
  elsif p_role in ('business_manager','business_staff')
        and p_business_id is not null
        and exists (
          select 1 from public.business_users bu
           where bu.user_id = v_caller and bu.role = 'business_manager'
             and bu.business_id = p_business_id
        )
  then
    null;
  else
    raise exception 'permission denied for role %', p_role;
  end if;

  -- agency roles are never business-scoped.
  if p_role in ('agency_admin','agency_va') then
    p_business_id := null;
  end if;

  select lower(u.email::text) into v_email from auth.users u where u.id = p_user_id;
  if v_email is null then
    raise exception 'user % not found', p_user_id;
  end if;

  insert into public.profiles (id, full_name, email)
  values (p_user_id, coalesce(p_full_name, ''), v_email)
  on conflict (id) do update
    set email     = excluded.email,
        full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name);

  delete from public.business_users bu
   where bu.user_id = p_user_id
     and coalesce(bu.business_id, '00000000-0000-0000-0000-000000000000'::uuid)
       = coalesce(p_business_id, '00000000-0000-0000-0000-000000000000'::uuid);

  insert into public.business_users (user_id, business_id, role)
  values (p_user_id, p_business_id, p_role);
end; $$;
grant execute on function public.attach_team_role(uuid, text, uuid, text) to authenticated;


-- 5c. create_invitation (legacy magic-link path) — accept agency_va too.
drop function if exists public.create_invitation(text, text, uuid) cascade;
create function public.create_invitation(
  p_email       text,
  p_role        text,
  p_business_id uuid default null
)
returns table (invitation_id uuid, invite_token uuid)
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
  if p_role not in ('agency_admin','agency_va','business_manager','business_staff') then
    raise exception 'invalid role';
  end if;

  if p_role in ('agency_admin','agency_va') then
    if not public.is_agency_admin() then
      raise exception 'only agency_admin can invite agency roles';
    end if;
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

  insert into public.pending_invitations as pi
    (email, business_id, role, invited_by)
  values
    (v_email, p_business_id, p_role, v_caller)
  returning pi.id, pi.token into v_id, v_tok;

  return query select v_id, v_tok;
end; $$;
grant execute on function public.create_invitation(text, text, uuid) to authenticated;


-- =====================================================================
-- 6. list_team_members — surface agency_va on the agency Team page
-- =====================================================================
-- The CP-31 version only returns agency_admin rows for the agency-wide
-- (p_business_id IS NULL) list. Include agency_va so admins can see and
-- remove VAs from the Team page. remove_team_member already lets an
-- agency_admin remove any role, so no change is needed there.
-- =====================================================================
drop function if exists public.list_team_members(uuid);

create or replace function public.list_team_members(p_business_id uuid default null)
returns table (
  kind         text,
  user_id      uuid,
  email        text,
  full_name    text,
  role         text,
  business_id  uuid,
  status       text,
  token        uuid,
  created_at   timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_business_id is null then
    if not public.is_agency_admin() then
      raise exception 'permission denied';
    end if;
  else
    if not (public.is_agency_admin() or public.is_business_manager(p_business_id)) then
      raise exception 'permission denied';
    end if;
  end if;

  return query
    select 'member'::text, u.user_id, p.email, p.full_name, u.role, u.business_id,
           'active'::text, null::uuid, u.created_at
      from public.business_users u
      join public.profiles p on p.id = u.user_id
     where (p_business_id is not null and u.business_id = p_business_id)
        or (p_business_id is null and u.role in ('agency_admin','agency_va'))
    union all
    select 'invitation'::text, null::uuid, i.email, null::text, i.role, i.business_id,
           case
             when i.accepted_at is not null then 'active'
             when i.revoked_at  is not null then 'revoked'
             when i.expires_at  <  now()    then 'expired'
             else 'pending'
           end,
           i.token, i.created_at
      from public.pending_invitations i
     where (p_business_id is not null and i.business_id = p_business_id)
        or (p_business_id is null and i.role in ('agency_admin','agency_va'))
    order by 1 desc, 9 desc;
end; $$;
grant execute on function public.list_team_members(uuid) to authenticated;

notify pgrst, 'reload schema';


-- =====================================================================
-- CP-62 done. Apply after cp60.
-- =====================================================================
