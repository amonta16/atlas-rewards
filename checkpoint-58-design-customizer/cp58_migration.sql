-- CP-58 — App-builder design customizer
-- Adds two per-business design tokens the brand editor now writes:
--   card_style   : how reward/stat/offer cards look (corners, shadow, outline)
--   button_style : the shape of every CTA button in the customer app
-- Both are nullable text. NULL / unset = the current default look, so every
-- existing business is unchanged until the agency picks a style.
--
-- Gradient-palette backgrounds reuse the existing businesses.background_pattern
-- column (they're just new pattern IDs), so no column is needed for those.

alter table public.businesses
  add column if not exists card_style   text,
  add column if not exists button_style text;

comment on column public.businesses.card_style   is
  'CP-58 design token: soft | rounded | sharp | elevated | outlined. NULL = default (rounded).';
comment on column public.businesses.button_style is
  'CP-58 design token: pill | rounded | soft | square. NULL = default (rounded).';
