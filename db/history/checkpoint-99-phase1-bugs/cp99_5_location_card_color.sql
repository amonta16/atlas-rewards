-- =====================================================================
-- CP-99 · Phase 3c.1 — LOCATION BAND COLOR (app builder)
-- =====================================================================
-- Apply in the Supabase SQL editor. Idempotent, additive only.
--
-- businesses.location_card_color — background color (hex) of the
-- full-width band behind the map + Call-now card at the bottom of the
-- customer Home. Picked in the brand editor (Design → Location & map).
-- Plain text, validated app-side (location-card.tsx falls back to white
-- for null/blank — deliberate: no CHECK constraint, per the
-- CP-44.1/CP-86 lesson).
-- NULL = white = the exact look every existing business has today.
-- =====================================================================

alter table public.businesses
  add column if not exists location_card_color text;

notify pgrst, 'reload schema';
