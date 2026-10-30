-- =====================================================================
-- CP-66 — Section layout columns (run any time; idempotent)
-- =====================================================================
-- Structural layout presets, picked in the brand editor
-- (lib/section-layouts.ts):
--   rewards_layout: grid (default) | list | carousel | spotlight
--   offers_layout:  stack (default) | coupon | carousel | billboard
-- NULL = defaults, so existing businesses are pixel-identical until a
-- layout is chosen. Unknown ids fall back app-side.
-- =====================================================================

alter table public.businesses
  add column if not exists rewards_layout text,
  add column if not exists offers_layout text;

comment on column public.businesses.rewards_layout is
  'CP-66: rewards store layout id (see lib/section-layouts.ts). NULL = grid.';
comment on column public.businesses.offers_layout is
  'CP-66: limited-offers layout id (see lib/section-layouts.ts). NULL = stack.';
