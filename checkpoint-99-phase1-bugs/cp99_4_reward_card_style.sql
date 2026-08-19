-- =====================================================================
-- CP-99 · Phase 3b.1 — REWARD PANEL STYLE PRESETS (app builder)
-- =====================================================================
-- Apply in the Supabase SQL editor. Idempotent, additive only.
--
-- businesses.reward_card_style — the reward-store panel look picked in
-- the brand editor (classic / outline / glow / tint / midnight / luxe).
-- Plain text, validated app-side (lib/reward-card-styles.ts falls back
-- to "classic" for null/unknown — deliberate: no CHECK constraint, per
-- the CP-44.1/CP-86 lesson about CHECKs fighting later additions).
-- NULL = "classic" = the CP-99 3b look → existing businesses unchanged.
-- =====================================================================

alter table public.businesses
  add column if not exists reward_card_style text;

notify pgrst, 'reload schema';
