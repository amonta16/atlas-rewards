-- =====================================================================
-- CP-67 — Design element pack columns (run any time; idempotent)
-- =====================================================================
-- Four finishing-touch levers, picked in the brand editor
-- (lib/element-styles.ts):
--   badge_style:   gradient (default) | solid | outline | dark | glow
--   heading_style: plain (default) | bar | underline | sticker
--   divider_style: none (default) | line | dots | sparkle
--   cta_glow:      none (default) | soft | bold
-- All NULL = defaults, pixel-identical until something is picked.
-- =====================================================================

alter table public.businesses
  add column if not exists badge_style text,
  add column if not exists heading_style text,
  add column if not exists divider_style text,
  add column if not exists cta_glow text;

comment on column public.businesses.badge_style is
  'CP-67: chip/badge style id (see lib/element-styles.ts). NULL = gradient.';
comment on column public.businesses.heading_style is
  'CP-67: section-title style id. NULL = plain.';
comment on column public.businesses.divider_style is
  'CP-67: section divider style id. NULL = none.';
comment on column public.businesses.cta_glow is
  'CP-67: CTA button glow id (none/soft/bold). NULL = none.';
