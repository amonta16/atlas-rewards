-- CP-229 · Admin folders: one product tab each (Venues | Med Spas) + the CP-128.2 parent column.
-- APPLIED to Supabase by Claude on 2026-10-30 (migration cp229_folder_product_and_parent). Re-runnable.
alter table public.business_folders
  add column if not exists parent_folder_id uuid references public.business_folders(id) on delete set null;
alter table public.business_folders drop constraint if exists business_folders_not_self;
alter table public.business_folders add constraint business_folders_not_self check (parent_folder_id is null or parent_folder_id <> id);
create index if not exists business_folders_parent_idx on public.business_folders(parent_folder_id);

alter table public.business_folders add column if not exists product text not null default 'venues';
alter table public.business_folders drop constraint if exists business_folders_product_chk;
alter table public.business_folders add constraint business_folders_product_chk check (product in ('venues','medspa'));

update public.business_folders f set product = 'medspa'
where f.name ilike '%med%spa%'
   or (select count(*) filter (where b.layout_preset = 'medspa') > count(*) filter (where b.layout_preset is distinct from 'medspa')
       from public.businesses b where b.folder_id = f.id);

notify pgrst, 'reload schema';
