-- =====================================================================
-- CP-57 — customizable background-pattern color
-- =====================================================================
-- Idempotent. Lets the agency tint the background pattern independently
-- of the brand primary color. NULL = use the brand primary (current behavior).
-- =====================================================================

alter table public.businesses
  add column if not exists pattern_color text;

notify pgrst, 'reload schema';
