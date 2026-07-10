-- CP-60 — Apps command deck: real folders (name + cover art) as first-class
-- objects, plus a dedicated storage bucket for folder cover images.
--
-- Replaces CP-59's plain businesses.folder text with a proper folders table so
-- the agency can create, rename, cover-image, and delete folders — and moving a
-- business is just setting its folder_id.

-- ---------------------------------------------------------------------------
-- 0. Fix: the CP-52.4 background_pattern CHECK constraint hard-codes an old
--    list of pattern ids, so saving a business with a newer pattern (CP-58.1's
--    mesh/silk/orbs/waves-layered/hills) fails with
--    "violates check constraint businesses_background_pattern_chk".
--    The Design picker (lib/patterns.ts PATTERN_OPTIONS) is the real source of
--    truth for valid ids, so we just drop the constraint instead of chasing it
--    every time we add a pattern.
-- ---------------------------------------------------------------------------
alter table public.businesses
  drop constraint if exists businesses_background_pattern_chk;

-- ---------------------------------------------------------------------------
-- 1. Folders table
-- ---------------------------------------------------------------------------
create table if not exists public.business_folders (
  id              uuid primary key default uuid_generate_v4(),
  name            text not null,
  cover_image_url text,
  sort            int  not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- keep updated_at fresh (set_updated_at() is defined in the CP-01 schema)
drop trigger if exists set_updated_at on public.business_folders;
create trigger set_updated_at
  before update on public.business_folders
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Link businesses → folder
-- ---------------------------------------------------------------------------
alter table public.businesses
  add column if not exists folder_id uuid references public.business_folders(id) on delete set null;

create index if not exists businesses_folder_id_idx on public.businesses(folder_id);

-- ---------------------------------------------------------------------------
-- 3. Backfill from CP-59's businesses.folder text, if that column exists.
--    Distinct folder names become folder rows; each business points at its own.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'businesses' and column_name = 'folder'
  ) then
    insert into public.business_folders (name)
    select distinct trim(b.folder)
    from public.businesses b
    where b.folder is not null and trim(b.folder) <> ''
      and not exists (
        select 1 from public.business_folders bf where bf.name = trim(b.folder)
      );

    update public.businesses b
    set folder_id = bf.id
    from public.business_folders bf
    where b.folder is not null and trim(b.folder) = bf.name and b.folder_id is null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. RLS — only agency admins touch folders.
-- ---------------------------------------------------------------------------
alter table public.business_folders enable row level security;

do $$ begin
  begin drop policy "folders_agency_all" on public.business_folders; exception when undefined_object then null; end;
end $$;

create policy "folders_agency_all" on public.business_folders
  for all to authenticated
  using (
    exists (select 1 from public.business_users bu
            where bu.user_id = auth.uid() and bu.role = 'agency_admin')
  )
  with check (
    exists (select 1 from public.business_users bu
            where bu.user_id = auth.uid() and bu.role = 'agency_admin')
  );

-- ---------------------------------------------------------------------------
-- 5. Storage bucket for folder cover images (public read, authenticated write).
--    Matches the permissive pattern used by the other image buckets.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('folder-covers', 'folder-covers', true)
on conflict (id) do nothing;

do $$ begin
  begin drop policy "folder_covers_public_read"  on storage.objects; exception when undefined_object then null; end;
  begin drop policy "folder_covers_auth_write"    on storage.objects; exception when undefined_object then null; end;
  begin drop policy "folder_covers_auth_update"   on storage.objects; exception when undefined_object then null; end;
  begin drop policy "folder_covers_auth_delete"   on storage.objects; exception when undefined_object then null; end;
end $$;

create policy "folder_covers_public_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'folder-covers');

create policy "folder_covers_auth_write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'folder-covers');

create policy "folder_covers_auth_update" on storage.objects
  for update to authenticated
  using      (bucket_id = 'folder-covers')
  with check (bucket_id = 'folder-covers');

create policy "folder_covers_auth_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'folder-covers');
