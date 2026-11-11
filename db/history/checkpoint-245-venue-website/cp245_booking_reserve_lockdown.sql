-- CP-245 · venue website + booking lockdown
-- APPLIED to production (gqmjpntzupnmjooszvcd) on 2026-11-10 as migration
-- "lockdown_booking_resource_reserve". Safe to re-run.
--
-- booking_resource_reserve is the shared capacity-check-and-insert core
-- behind book_resource (customer app) and desk_book_resource (front desk).
-- CP-147 only revoked it from PUBLIC, but Supabase's default privileges had
-- already granted EXECUTE to anon and authenticated, so anyone holding the
-- public anon key could call it directly: pick any p_user / p_membership,
-- pass p_source = 'desk' and skip the lead-time check, book inactive
-- resources, and have the booking auto-confirmed.
--
-- Callers after this change:
--   book_resource, desk_book_resource  SECURITY DEFINER owned by postgres → unaffected
--   /api/[business]/site-book          service_role (venue website)     → still granted
--
-- Verified after applying (inside a rolled-back transaction): the app path
-- and the website path both still book; a signed-in user calling the
-- function directly gets insufficient_privilege.

revoke all on function public.booking_resource_reserve(uuid, timestamptz, int, int, uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.booking_resource_reserve(uuid, timestamptz, int, int, uuid, uuid, text, text, text, text, text) to service_role;
