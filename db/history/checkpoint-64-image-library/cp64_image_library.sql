-- =====================================================================
-- CHECKPOINT 64 — Shared demo image library (bucket + table + RLS)
-- =====================================================================
-- What this is:
--   A pre-curated stock-photo library, organized by industry
--   (medspa, smoke shop, coffee shop, …) and by slot
--   (hero / reward / offer), so building a demo app never requires
--   hunting for images again. The agency builder gets a
--   "Choose from library" button on every image uploader.
--
-- This file (idempotent, safe to re-run):
--   1. Creates the public `image-library` storage bucket.
--   2. Storage policies: agency admins write, everyone reads.
--   3. Creates the `image_library` catalog table + browse index.
--   4. RLS: any staff member can browse, only agency admins manage.
--
-- After running this, seed the images:
--   cd checkpoint-02-brand-engine/atlas-rewards-app
--   node scripts/seed-image-library.mjs        (needs PEXELS_API_KEY)
-- =====================================================================

-- ----- 1. BUCKET (idempotent) -----
insert into storage.buckets (id, name, public) values
  ('image-library', 'image-library', true)
on conflict (id) do update set public = excluded.public;

-- ----- 2. STORAGE POLICIES (drop stale versions first) -----
do $$
declare p text;
begin
  for p in select unnest(array[
    'Agency manages image library',
    'Public read image library'
  ]) loop
    begin
      execute format('drop policy %I on storage.objects', p);
    exception when undefined_object then null;
    end;
  end loop;
end $$;

-- Only agency admins may write library assets. (The seed script uses the
-- service-role key and bypasses RLS entirely; this policy is for any
-- in-app curation later.)
create policy "Agency manages image library"
  on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'image-library'
    and exists (select 1 from public.business_users
                where user_id = auth.uid() and role = 'agency_admin')
  )
  with check (
    bucket_id = 'image-library'
    and exists (select 1 from public.business_users
                where user_id = auth.uid() and role = 'agency_admin')
  );

-- Customer apps render the picked URLs directly from this bucket,
-- so reads must be public — same as every other image bucket.
create policy "Public read image library"
  on storage.objects
  for select
  to public
  using (bucket_id = 'image-library');

-- ----- 3. CATALOG TABLE -----
create table if not exists public.image_library (
  id           uuid primary key default gen_random_uuid(),
  -- Library industry slug: 'medspa' | 'beauty-salon' | 'smoke-shop' |
  -- 'dispensary' | 'coffee-shop' | 'arcade' | 'ice-cream' | 'restaurant'
  -- (free text on purpose — adding an industry needs no migration).
  industry     text not null,
  -- Which builder slot this image is curated for.
  category     text not null check (category in ('hero','reward','offer')),
  title        text not null,
  tags         text[] not null default '{}',
  -- Path inside the image-library bucket: <industry>/<category>/<file>.
  -- Unique so the seed script is idempotent (re-runs upsert, not duplicate).
  storage_path text not null unique,
  public_url   text not null,
  -- Attribution ("Photo by X · Pexels") — Pexels license doesn't require
  -- it, but we keep it for provenance.
  credit       text,
  source_url   text,
  width        int,
  height       int,
  -- Soft-hide: the picker's "hide" button flips this instead of deleting,
  -- so a bad auto-curated photo disappears without touching storage.
  is_active    boolean not null default true,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists image_library_browse_idx
  on public.image_library (industry, category)
  where is_active;

-- ----- 4. TABLE RLS -----
alter table public.image_library enable row level security;

drop policy if exists "Staff browses image library" on public.image_library;
drop policy if exists "Agency manages image library rows" on public.image_library;

-- Anyone on the team (agency admin, VA, manager, front desk) can browse.
-- Customers are authenticated too but have no business_users row, so the
-- library stays out of their reach.
create policy "Staff browses image library"
  on public.image_library
  for select
  to authenticated
  using (exists (select 1 from public.business_users where user_id = auth.uid()));

-- Only agency admins curate (hide/retitle/reorder).
create policy "Agency manages image library rows"
  on public.image_library
  for all
  to authenticated
  using (exists (select 1 from public.business_users
                 where user_id = auth.uid() and role = 'agency_admin'))
  with check (exists (select 1 from public.business_users
                      where user_id = auth.uid() and role = 'agency_admin'));
