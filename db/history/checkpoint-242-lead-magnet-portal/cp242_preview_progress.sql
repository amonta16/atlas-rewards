-- CP-242 (lead-magnet audit, step 4): the preview portal's progress, for the skip-ahead button.
-- Applied to production 2026-11-10 as migration cp242_preview_progress.
--
-- · verified_at       the owner opened their front desk from the signed link in our email
--                     (proves the email is theirs)
-- · csv_imported_at   they imported their patient list on the preview desk. The list itself
--   csv_count         never leaves their browser; only the time and the row count are stored.
-- · app_installed_at  their preview app was opened from a phone's Home Screen
-- · desk_first_at     first visit to the preview desk (the 45 s video plays on that visit only)
--
-- "Turn it on now" on the desk shows only when verified_at, csv_imported_at and app_installed_at
-- are all set.
--
-- Undo:
--   alter table public.app_previews drop column if exists verified_at, drop column if exists csv_imported_at,
--     drop column if exists csv_count, drop column if exists app_installed_at, drop column if exists desk_first_at;

alter table public.app_previews
  add column if not exists verified_at      timestamptz,
  add column if not exists csv_imported_at  timestamptz,
  add column if not exists csv_count        integer check (csv_count is null or csv_count >= 0),
  add column if not exists app_installed_at timestamptz,
  add column if not exists desk_first_at    timestamptz;
