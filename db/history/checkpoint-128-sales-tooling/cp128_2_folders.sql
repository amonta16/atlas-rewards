-- =====================================================================
-- Atlas · CP-128.2 — nested app folders (one level: location → niche)
-- =====================================================================
-- business_folders gains parent_folder_id so the Apps deck can hold e.g.
-- "San Luis Obispo" ▸ "Smoke shops" / "Cafés". One level deep by design
-- (the app only ever offers top-level folders as parents). Deleting a
-- parent releases its children to the top level (ON DELETE SET NULL) —
-- nothing cascades, no apps are touched.
--
-- Safe to run on production, re-runnable. Deploy the CP-128.2 app with it.
-- =====================================================================

begin;

alter table public.business_folders
  add column if not exists parent_folder_id uuid
    references public.business_folders(id) on delete set null;

alter table public.business_folders
  drop constraint if exists business_folders_not_self;
alter table public.business_folders
  add constraint business_folders_not_self
  check (parent_folder_id is null or parent_folder_id <> id);

create index if not exists business_folders_parent_idx
  on public.business_folders(parent_folder_id);

commit;

notify pgrst, 'reload schema';
