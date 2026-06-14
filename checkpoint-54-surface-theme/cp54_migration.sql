-- =====================================================================
-- CP-54 — customizable header + background (surface) colors
-- =====================================================================
-- Idempotent. Lets the agency pick a header color and a background color
-- per business (incl. a dark mode) instead of fixed white. Content cards
-- stay white; on-background text auto-flips light/dark for contrast (done
-- in the app, no SQL). NULL = the default light surface.
-- =====================================================================

alter table public.businesses
  add column if not exists header_color  text,
  add column if not exists surface_color text;

notify pgrst, 'reload schema';
