-- =====================================================================
-- CP-52 — Customer home polish + background patterns
-- =====================================================================
-- Apply AFTER cp51 (no SQL there) / cp50. Idempotent.
--
-- Adds a per-business background_pattern choice (Design picker in the
-- brand editor). Everything else in CP-52 is front-end only.
--   none | geometric | medspa | restaurant | arcade | logo
-- =====================================================================

alter table public.businesses
  add column if not exists background_pattern text not null default 'none';

-- Keep it to known values (cheap guard; editor only ever sends these).
do $$ begin
  begin
    alter table public.businesses
      add constraint businesses_background_pattern_chk
      check (background_pattern in ('none','geometric','medspa','restaurant','arcade','logo'));
  exception when duplicate_object then null; end;
end $$;

notify pgrst, 'reload schema';
