-- =====================================================================
-- CHECKPOINT 82 — VA front-desk access + image-library writes
-- =====================================================================
-- Symptoms this fixes (reported by the VA):
--   1. "permission denied: business_manager required"
--        → she opened a business's FRONT DESK / tried to save a
--          membership. Every manager-gated RPC funnels through
--          public.is_business_manager(), which (before CP-62.1) only
--          knew agency_admin + the per-business manager.
--   2. "new row violates row-level security policy"
--        → she tried to UPLOAD a photo into the shared image library.
--          The CP-64 policies let only agency_admin write to the
--          `image_library` table and the `image-library` bucket.
--
-- Both fixes shipped as SQL before (cp62_1_permissions_fix.sql and
-- cp64_1_library_uploads.sql) but the errors prove at least one of them
-- was never actually run in Supabase. This file is SELF-CONTAINED and
-- IDEMPOTENT: it re-asserts everything those two files did, plus the new
-- CP-82 bits (front-desk reach + library curation for VAs). You can run
-- it on its own — you do NOT need to hunt down the older files first.
--
-- What a VA (role = 'agency_va') can do after this:
--   • open /<slug>/manage — the FRONT DESK — for any business, with the
--     same tabs an agency_admin sees (desk, users, insights, offers,
--     news, billing, membership, team)
--   • scan/award/redeem, save memberships, edit offers/news/rewards
--   • pick images from the shared library in every builder image field
--   • UPLOAD new photos into the library (new niches included) and
--     soft-hide / retitle library rows
--
-- What a VA still CANNOT do (unchanged, by design):
--   • delete a business (request-to-delete flow → admin approves)
--   • agency Analytics / Pipeline / Team / Settings
--   • approve delete requests
--   • hard-delete rows out of the image library
--
-- Apply in Supabase → SQL Editor. Safe to re-run.
-- =====================================================================


-- =====================================================================
-- 0. Role vocabulary — make sure 'agency_va' is a legal role value
-- =====================================================================
-- (No-op if cp62_migration.sql already ran. Cheap insurance so the rest
-- of this file can't fail on a stale CHECK constraint.)
alter table public.business_users      drop constraint if exists business_users_role_check;
alter table public.business_users
  add  constraint business_users_role_check
  check (role in ('agency_admin','agency_va','business_manager','business_staff'));

alter table public.pending_invitations drop constraint if exists pending_invitations_role_check;
alter table public.pending_invitations
  add  constraint pending_invitations_role_check
  check (role in ('agency_admin','agency_va','business_manager','business_staff'));


-- =====================================================================
-- 1. Role helpers
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
-- 2. Manager-level reach — the fix for "business_manager required"
-- =====================================================================
-- is_business_manager() is the gate on upsert_membership_billing,
-- business_analytics_rollup, the offers/news writes and ~every other
-- manager RPC. Teaching it about VAs unlocks the whole desk in one move.
-- It's also what current_app_role() reads, so the front-desk UI will now
-- hand a VA the full manager tab set instead of the front-desk subset.
create or replace function public.is_business_manager(b_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_agency_admin()
      or public.is_agency_va()
      or exists (
        select 1 from public.business_users
         where user_id = auth.uid()
           and business_id = b_id
           and role = 'business_manager'
      );
$$;
grant execute on function public.is_business_manager(uuid) to authenticated;

-- staffs_business() backs the staff-level table RLS: rewards, redemptions,
-- reviews, events, points ledger, automation rules, webhooks. Without this
-- a VA on the desk sees empty lists instead of errors.
create or replace function public.staffs_business(b_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.business_users
     where user_id = auth.uid() and business_id = b_id
  ) or public.is_agency_admin()
    or public.is_agency_va();
$$;
grant execute on function public.staffs_business(uuid) to authenticated;

-- manages_business() (CP-49) gates the front-desk PIN tools on the desk's
-- Team tab — set/rotate a 4-digit PIN, provision a front-desk login.
-- A VA setting a business up end-to-end needs this or the Team tab
-- errors the moment she touches it.
create or replace function public.manages_business(p_business_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.business_users bu
    where bu.user_id = auth.uid()
      and (
        bu.role = 'agency_admin'
        or bu.role = 'agency_va'
        or (bu.business_id = p_business_id and bu.role = 'business_manager')
      )
  );
$$;
grant execute on function public.manages_business(uuid) to authenticated;


-- =====================================================================
-- 3. Per-business image buckets — hero / logo / reward / offer / news
-- =====================================================================
-- Rebuilt so the agency branch is is_agency_staff() (admin OR VA).
-- Managers + front desk keep their own-business-prefix branch.
do $$ begin
  begin drop policy "Atlas staff manages business assets" on storage.objects; exception when undefined_object then null; end;
end $$;

create policy "Atlas staff manages business assets"
  on storage.objects
  for all
  to authenticated
  using (
    bucket_id in ('business-logos','business-heroes','reward-images','offer-images','news-images','membership-images')
    and (
      public.is_agency_staff()
      or exists (select 1 from public.business_users bu
                 where bu.user_id = auth.uid()
                   and bu.role in ('business_manager','business_staff')
                   and split_part(storage.objects.name, '/', 1) = bu.business_id::text)
    )
  )
  with check (
    bucket_id in ('business-logos','business-heroes','reward-images','offer-images','news-images','membership-images')
    and (
      public.is_agency_staff()
      or exists (select 1 from public.business_users bu
                 where bu.user_id = auth.uid()
                   and bu.role in ('business_manager','business_staff')
                   and split_part(storage.objects.name, '/', 1) = bu.business_id::text)
    )
  );


-- =====================================================================
-- 4. Shared image library — CATALOG TABLE (public.image_library)
-- =====================================================================
-- Browse: anyone on the team (unchanged).
-- Insert: agency_admin + agency_va  ← fixes "new row violates RLS"
-- Update: agency_admin + agency_va  ← soft-hide / retitle / reorder
-- Delete: agency_admin only         ← VAs can't nuke library rows
--
-- Postgres ORs permissive policies together, so the admin-only "Agency
-- manages image library rows" policy from CP-64 can stay as-is; these
-- simply widen INSERT and UPDATE.
drop policy if exists "Agency staff adds library images"    on public.image_library;
drop policy if exists "Agency staff edits library images"   on public.image_library;

create policy "Agency staff adds library images"
  on public.image_library
  for insert
  to authenticated
  with check (
    exists (select 1 from public.business_users
            where user_id = auth.uid()
              and role in ('agency_admin','agency_va'))
  );

create policy "Agency staff edits library images"
  on public.image_library
  for update
  to authenticated
  using (
    exists (select 1 from public.business_users
            where user_id = auth.uid()
              and role in ('agency_admin','agency_va'))
  )
  with check (
    exists (select 1 from public.business_users
            where user_id = auth.uid()
              and role in ('agency_admin','agency_va'))
  );


-- =====================================================================
-- 5. Shared image library — STORAGE BUCKET (image-library)
-- =====================================================================
-- The upload writes storage FIRST, then the catalog row — so both halves
-- need the VA. INSERT is what the uploader uses (upsert:false); UPDATE is
-- included so a re-upload of the same path doesn't 403.
do $$
declare p text;
begin
  for p in select unnest(array[
    'Agency staff uploads library assets',
    'Agency staff updates library assets'
  ]) loop
    begin execute format('drop policy %I on storage.objects', p);
    exception when undefined_object then null;
    end;
  end loop;
end $$;

create policy "Agency staff uploads library assets"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'image-library'
    and exists (select 1 from public.business_users
                where user_id = auth.uid()
                  and role in ('agency_admin','agency_va'))
  );

create policy "Agency staff updates library assets"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'image-library'
    and exists (select 1 from public.business_users
                where user_id = auth.uid()
                  and role in ('agency_admin','agency_va'))
  )
  with check (
    bucket_id = 'image-library'
    and exists (select 1 from public.business_users
                where user_id = auth.uid()
                  and role in ('agency_admin','agency_va'))
  );

-- Reads stay public so customer apps can render library-picked images.
do $$ begin
  begin drop policy "Public read image library" on storage.objects; exception when undefined_object then null; end;
end $$;
create policy "Public read image library"
  on storage.objects
  for select
  to public
  using (bucket_id = 'image-library');


-- =====================================================================
-- 6. Tell PostgREST to reload
-- =====================================================================
notify pgrst, 'reload schema';


-- =====================================================================
-- 7. VERIFY (run these after — both should come back clean)
-- =====================================================================
-- a) Confirm the VA actually has the agency_va row. If this returns
--    nothing, THAT is the real problem — she was never given the role.
--    Replace the email with hers.
--
--   select u.email, bu.role, bu.business_id
--     from auth.users u
--     join public.business_users bu on bu.user_id = u.id
--    where u.email = 'her-email@example.com';
--
--    If it comes back empty, add the role:
--   insert into public.business_users (user_id, business_id, role)
--   select id, null, 'agency_va' from auth.users where email = 'her-email@example.com'
--   on conflict do nothing;
--
-- b) Confirm the policies landed:
--
--   select policyname, cmd from pg_policies
--    where tablename = 'image_library' order by policyname;
--
--   select policyname, cmd from pg_policies
--    where schemaname = 'storage' and tablename = 'objects'
--      and policyname ilike '%library%' order by policyname;
--
-- CP-82 done.
-- =====================================================================
