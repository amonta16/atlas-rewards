-- =====================================================================
-- CP-64.1 — Library uploads for admins + VAs (run after cp64)
-- =====================================================================
-- Lets app builders (agency admins AND the agency_va role) upload their
-- own photos into the shared image library — filed by niche + section,
-- tagged, and reusable across every future demo app.
--
-- Hiding / editing / deleting library images stays agency_admin-only
-- (the CP-64 "Agency manages image library rows" policy).
-- Idempotent; safe to re-run.
-- =====================================================================

-- ----- 1. TABLE: admins + VAs may INSERT catalog rows -----
drop policy if exists "Agency staff adds library images" on public.image_library;

create policy "Agency staff adds library images"
  on public.image_library
  for insert
  to authenticated
  with check (
    exists (select 1 from public.business_users
            where user_id = auth.uid()
              and role in ('agency_admin', 'agency_va'))
  );

-- ----- 2. STORAGE: admins + VAs may upload into the bucket -----
do $$
begin
  begin
    execute 'drop policy "Agency staff uploads library assets" on storage.objects';
  exception when undefined_object then null;
  end;
end $$;

create policy "Agency staff uploads library assets"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'image-library'
    and exists (select 1 from public.business_users
                where user_id = auth.uid()
                  and role in ('agency_admin', 'agency_va'))
  );
