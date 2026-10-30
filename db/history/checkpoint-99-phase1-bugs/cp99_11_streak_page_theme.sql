-- =====================================================================
-- CP-99 · STREAK PAGE THEME (simplified streak visual system)
-- =====================================================================
-- Apply in the Supabase SQL editor. Idempotent, additive only.
--
-- businesses.streak_page_theme — ONE choice from the curated theme
-- library in lib/streak-page-themes.ts (brand-app / clean-brand /
-- soft-gradient / classic / premium-minimal / ocean / confetti-pop /
-- balloons / arcade-pop / fire-icons / star-field / sparkle-burst /
-- bokeh / dark-bokeh / cosmic / celebration / luxe-gold).
-- NULL = legacy behavior: the old streak_env_color / streak_env_pattern
-- fields still resolve, and unset businesses keep the ocean default —
-- nothing changes until a theme is picked.
-- Plain text, validated app-side. No CHECK, per the CP-44.1/CP-86 lesson.
-- =====================================================================

alter table public.businesses
  add column if not exists streak_page_theme text;

notify pgrst, 'reload schema';
