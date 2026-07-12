-- =====================================================================
-- CP-65 — Streak theme column (run any time; idempotent)
-- =====================================================================
-- The streak surfaces (header chip, Home teaser, trail, full panel) are no
-- longer locked to orange. Each business picks a theme in the brand editor:
--   fire (default) | gold | neon | pink | blue | gray | coffee | midnight
--   | brand (derived live from the business's primary color)
-- NULL = classic fire, so existing businesses are pixel-identical until a
-- theme is chosen. Values are validated app-side (lib/streak-themes.ts) —
-- unknown ids just fall back to fire, so adding themes needs no migration.
-- =====================================================================

alter table public.businesses
  add column if not exists streak_theme text;

comment on column public.businesses.streak_theme is
  'CP-65: streak surface theme id (see lib/streak-themes.ts). NULL = classic fire.';
