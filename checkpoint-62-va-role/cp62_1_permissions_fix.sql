-- =====================================================================
-- CHECKPOINT 62.1 — VA app-management permissions fix
-- =====================================================================
-- Symptom: a VA (agency_va) couldn't upload hero/logo images or save a
-- membership, even though they can create + open apps.
--
-- Root cause: CP-62 opened the `businesses` table + create_business to VAs,
-- but almost everything ELSE the app-builder writes (memberships, rewards,
-- offers, news, images) is gated by two helpers that only recognize
-- agency_admin + per-business managers — NOT VAs:
--     • is_business_manager(b_id)  → membership save, analytics, offers…
--     • staffs_business(b_id)      → rewards/redemptions/reviews/events RLS
-- And the image-upload storage policy inlines an admin-only check.
--
-- An agency_admin gets all this power precisely because BOTH helpers call
-- is_agency_admin() internally. The faithful "VA = admin for apps" fix is to
-- add is_agency_va() alongside it. The VA's restrictions (delete, agency
-- analytics/team/settings/pipeline, approvals) are separate is_agency_admin()
-- gates and are unaffected.
--
-- Apply AFTER cp62_migration.sql. Idempotent — safe to re-run.
-- =====================================================================

-- Defensive: make sure the CP-62 helpers exist even if this runs first.
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
-- 1. is_business_manager — treat a VA like an admin (manager-level reach)
-- =====================================================================
-- Unlocks: membership save (upsert_membership_billing), offers, analytics
-- rollups, and every manager-gated RPC/policy — for VAs on ANY business.
-- =====================================================================
create or replace function public.is_business_manager(b_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
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


-- =====================================================================
-- 2. staffs_business — treat a VA like an admin (staff-level reach)
-- =====================================================================
-- Unlocks the staff-level table RLS (rewards, redemptions, reviews,
-- events, ledger, automation, webhooks) so a VA can edit those in the
-- app-builder just like an admin.
-- =====================================================================
create or replace function public.staffs_business(b_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.business_users
     where user_id = auth.uid() and business_id = b_id
  ) or public.is_agency_admin()
    or public.is_agency_va();
$$;
grant execute on function public.staffs_business(uuid) to authenticated;


-- =====================================================================
-- 3. Image uploads — let VAs write to every business image bucket
-- =====================================================================
-- The unified CP-14 write policy only matched agency_admin (or a manager
-- whose business_id prefixes the file path). Rebuild it so the agency-level
-- branch is is_agency_staff() (admin OR VA). Managers/front-desk keep their
-- own-business branch. Covers business-heroes, business-logos, reward-images,
-- offer-images, news-images, membership-images.
-- =====================================================================
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

notify pgrst, 'reload schema';

-- =====================================================================
-- CP-62.1 done. Apply after cp62_migration.sql.
-- =====================================================================
