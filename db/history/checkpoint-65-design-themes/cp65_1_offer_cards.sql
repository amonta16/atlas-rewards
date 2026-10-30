-- =====================================================================
-- CP-65.1 — Offer-card style column (run any time; idempotent)
-- =====================================================================
-- The customer "Limited offers" cards are no longer locked to flat white.
-- Styles (picked in the brand editor, lib/offer-card-styles.ts):
--   clean (default) | tint | pop | gradient | midnight | luxe
-- NULL = clean white, so existing businesses are pixel-identical until a
-- style is chosen. Unknown ids fall back to clean app-side.
-- =====================================================================

alter table public.businesses
  add column if not exists offer_card_style text;

comment on column public.businesses.offer_card_style is
  'CP-65.1: customer offer-card style id (see lib/offer-card-styles.ts). NULL = clean white.';
