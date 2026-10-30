-- =====================================================================
-- CP-56 — customizable featured-offer banner style
-- =====================================================================
-- Idempotent. Lets the agency pick the sticky offer banner's look
-- (solid / gradient / stripes / confetti + seasonal themes like Christmas)
-- in the brand editor. NULL/'stripes' = the current default.
-- =====================================================================

alter table public.businesses
  add column if not exists banner_style text;

notify pgrst, 'reload schema';
