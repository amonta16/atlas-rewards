-- =====================================================================
-- CP-99 · Phase 4 — STREAK PAGE ENVIRONMENT PATTERN (app builder)
-- =====================================================================
-- Apply in the Supabase SQL editor. Idempotent, additive only.
--
-- businesses.streak_env_pattern — faint CSS atmosphere pattern for the
-- streak page's outer environment (none / lowpoly / waves / stars /
-- ascent). Rendered by lib/streak-themes.ts streakEnvPatternCss and
-- masked OUT of the protected center corridor, so the road always stays
-- clean. Plain text, validated app-side (null/unknown → no pattern).
-- No CHECK constraint, per the CP-44.1/CP-86 lesson.
-- =====================================================================

alter table public.businesses
  add column if not exists streak_env_pattern text;

notify pgrst, 'reload schema';
