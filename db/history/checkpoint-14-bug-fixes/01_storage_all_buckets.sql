-- =====================================================================
-- CHECKPOINT 14 — Definitive storage bucket setup (run-once, idempotent)
-- =====================================================================
-- Symptom this fixes:
--   "Bucket not found" when uploading a logo from the app builder, while
--   hero / reward uploads work. Root cause: the original CP 2 setup used
--   `create policy if not exists` (silently fails on some PG versions) and
--   later patches were missing `with check` clauses, so INSERTs were denied
--   even though SELECT worked.
--
-- This file:
--   1. Creates all four buckets we use (logos / heroes / rewards / offers).
--   2. Drops any stale policy versions to avoid duplicates.
--   3. Recreates each policy with BOTH `using` AND `with check` so reads
--      AND writes succeed for agency admins.
--   4. Adds public-read policies so customers see the images without auth.
-- =====================================================================

-- ----- 1. CREATE BUCKETS (idempotent) -----
insert into storage.buckets (id, name, public) values
  ('business-logos',       'business-logos',       true),
  ('business-heroes',      'business-heroes',      true),
  ('reward-images',        'reward-images',        true),
  ('offer-images',         'offer-images',         true),
  ('news-images',          'news-images',          true),
  ('membership-images',    'membership-images',    true)
on conflict (id) do update set public = excluded.public;

-- ----- 2. DROP ALL PRIOR POLICY VERSIONS (clean slate) -----
do $$
declare p text;
begin
  for p in select unnest(array[
    'Agency admins manage logos',
    'Public read on logos',
    'Agency manages heroes',
    'Public read heroes',
    'Agency manages rewards',
    'Public read rewards',
    'Agency manages offer images',
    'Public read offer images',
    'Atlas staff manages business assets',
    'Public read business assets'
  ]) loop
    begin
      execute format('drop policy %I on storage.objects', p);
    exception when undefined_object then null;
    end;
  end loop;
end $$;

-- ----- 3. ONE UNIFIED WRITE POLICY FOR ALL BUSINESS BUCKETS -----
-- Any agency admin can manage every image. Business managers can manage
-- assets belonging to their own business (folder-prefixed by business id).
create policy "Atlas staff manages business assets"
  on storage.objects
  for all
  to authenticated
  using (
    bucket_id in ('business-logos','business-heroes','reward-images','offer-images','news-images','membership-images')
    and (
      exists (select 1 from public.business_users
              where user_id = auth.uid() and role = 'agency_admin')
      or exists (select 1 from public.business_users bu
                 where bu.user_id = auth.uid()
                   and bu.role in ('business_manager','business_staff')
                   and split_part(storage.objects.name, '/', 1) = bu.business_id::text)
    )
  )
  with check (
    bucket_id in ('business-logos','business-heroes','reward-images','offer-images','news-images','membership-images')
    and (
      exists (select 1 from public.business_users
              where user_id = auth.uid() and role = 'agency_admin')
      or exists (select 1 from public.business_users bu
                 where bu.user_id = auth.uid()
                   and bu.role in ('business_manager','business_staff')
                   and split_part(storage.objects.name, '/', 1) = bu.business_id::text)
    )
  );

-- ----- 4. PUBLIC READ FOR ALL BUSINESS BUCKETS -----
create policy "Public read business assets"
  on storage.objects
  for select
  to public
  using (bucket_id in ('business-logos','business-heroes','reward-images','offer-images','news-images','membership-images'));
