-- =====================================================================
-- CP-99 · Phase 4 — STREAK PAGE ENVIRONMENT COLOR (app builder)
-- =====================================================================
-- Apply in the Supabase SQL editor. Idempotent, additive only.
--
-- businesses.streak_env_color — hex color the agency picks for the
-- streak page's environment. The app NEVER uses it literally: it is
-- desaturated and clamped dark (lib/streak-themes.ts streakEnvColors)
-- so white reward cards, the road, and the flame always stay readable.
-- Plain text, validated app-side (invalid/blank → ocean-blue default).
-- No CHECK constraint, per the CP-44.1/CP-86 lesson.
-- NULL = premium ocean blue = the default look.
-- =====================================================================

alter table public.businesses
  add column if not exists streak_env_color text;

notify pgrst, 'reload schema';
