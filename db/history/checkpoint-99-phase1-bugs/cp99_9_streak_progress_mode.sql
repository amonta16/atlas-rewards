-- =====================================================================
-- CP-99 · Phase 4 — STREAK PROGRESS COLOR MODE (app builder)
-- =====================================================================
-- Apply in the Supabase SQL editor. Idempotent, additive only.
--
-- businesses.streak_progress_mode — how the streak road's ACTIVE
-- progress is colored:
--   NULL / anything else → the streak theme's colors (classic fire
--                          red→orange→yellow by default)
--   'brand'              → a tonal range derived from the brand primary
--                          (same derivation as the "Match my brand"
--                          streak theme — depth, never a flat color)
-- Plain text, validated app-side. No CHECK constraint, per the
-- CP-44.1/CP-86 lesson.
-- =====================================================================

alter table public.businesses
  add column if not exists streak_progress_mode text;

notify pgrst, 'reload schema';
