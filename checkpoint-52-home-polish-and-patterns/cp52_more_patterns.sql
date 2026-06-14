-- =====================================================================
-- CP-52.4 — more background patterns
-- =====================================================================
-- Run AFTER cp52_migration.sql. Widens the background_pattern CHECK to
-- allow the new pattern ids (gradient, swirls, circles, waves, confetti,
-- honeycomb). Idempotent.
-- =====================================================================

alter table public.businesses
  drop constraint if exists businesses_background_pattern_chk;

alter table public.businesses
  add constraint businesses_background_pattern_chk
  check (background_pattern in (
    'none','gradient','aurora','blobs','lowpoly',
    'geometric','swirls','circles','waves','confetti',
    'honeycomb','medspa','restaurant','arcade','logo'
  ));

notify pgrst, 'reload schema';
