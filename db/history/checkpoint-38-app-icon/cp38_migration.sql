-- =====================================================================
-- CHECKPOINT 38 — Dedicated app icon (square PWA home-screen icon)
-- =====================================================================
-- Andrew flagged: horizontal logos get squished as PWA home-screen
-- icons. Adding a dedicated app_icon_url field so business owners can
-- upload a perfectly-square 512×512 PNG separately from their regular
-- logo (which still gets used in the customer app header + agency
-- dashboard).
--
-- Fallback chain: app_icon_url → logo_url → /icons/icon-512.png
--
-- Self-contained + idempotent. Apply after cp35.
-- =====================================================================

alter table public.businesses
  add column if not exists app_icon_url text;

-- That's it. No backfill needed — existing rows have app_icon_url=NULL
-- and the app's fallback chain handles that gracefully (uses logo_url).

-- =====================================================================
-- CP-38 done.
-- =====================================================================
