-- =====================================================================
-- CP-99 · HOME TOP-REWARDS + SAVED-GIFTS LAYOUTS (app builder)
-- =====================================================================
-- Apply in the Supabase SQL editor. Idempotent, additive only.
--
-- businesses.home_rewards_layout — the Home "Top rewards" section shape
--   (grid / list / carousel / spotlight — same set as rewards_layout).
--   NULL = grid = today's look.
-- businesses.saved_gifts_layout — the "Your saved gifts" section shape
--   (stack / grid / carousel). NULL = stack = today's look.
-- Plain text, validated app-side (lib/section-layouts.ts falls back to
-- the defaults). No CHECK constraints, per the CP-44.1/CP-86 lesson.
-- =====================================================================

alter table public.businesses
  add column if not exists home_rewards_layout text;

alter table public.businesses
  add column if not exists saved_gifts_layout text;

notify pgrst, 'reload schema';
