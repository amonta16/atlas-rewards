-- CP-219 · SECURITY FIX — NOT YET APPLIED (needs Andrew's go-ahead)
-- _grant_automated_offer is an internal helper whose only caller is the
-- process_member_date_offers cron job (runs as postgres). It is SECURITY
-- DEFINER, has no caller check, and was executable by PUBLIC/anon/authenticated,
-- so any signed-in member could call /rest/v1/rpc/_grant_automated_offer to
-- re-arm an already-used Welcome/Birthday gift (new redeem code) or, for a
-- points_bonus config, mint points. Revoking does not affect the cron job.
revoke execute on function public._grant_automated_offer(uuid,uuid,text,text,text,text) from public, anon, authenticated;
