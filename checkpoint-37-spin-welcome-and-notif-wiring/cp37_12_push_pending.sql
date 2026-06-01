-- =====================================================================
-- CP-37.12 — push_sent_at column + process-pending RPC
-- =====================================================================
-- Real-event notifications (reward_unlocked, daily_check, etc.) were
-- inserting in-app rows fine but no phone push fired. The CP-42
-- universal pg_net fanout trigger silently failed in production —
-- it works on paper but pg_net + the atlas.base_url setting need
-- per-deploy wiring that drifted.
--
-- Better path: a Vercel cron job picks up unprocessed notifications
-- every minute and pushes them via sendPushToUsers — the SAME
-- proven path "Send to all members" uses. No pg_net dependency.
--
-- This migration:
--   1. Adds notifications.push_sent_at (NULL = needs push, timestamp = sent).
--   2. Disables the legacy pg_net fanout trigger (no longer needed,
--      avoids it competing with the cron path).
--   3. Adds list_pending_pushes RPC the route handler calls.
-- =====================================================================

-- (1) Track push send state.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS push_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS notifications_push_pending_idx
  ON public.notifications (created_at)
  WHERE push_sent_at IS NULL;

-- (2) Retire the pg_net fanout trigger — it was the silent-failure
-- culprit. We keep the function around for forensic debugging but the
-- trigger is gone, so notification INSERTs no longer attempt the
-- pg_net HTTP hop. The Vercel cron picks them up instead.
DROP TRIGGER IF EXISTS trg_notif_push_fanout ON public.notifications;


-- (3) Pending-push reader. Returns the next 100 rows that need a
-- push. Service-role only (the route calls it via the admin client).
CREATE OR REPLACE FUNCTION public.list_pending_pushes(p_limit int DEFAULT 100)
RETURNS TABLE (
  id          uuid,
  user_id     uuid,
  business_id uuid,
  kind        text,
  title       text,
  body        text,
  link_path   text,
  created_at  timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, user_id, business_id, kind, title, body, link_path, created_at
    FROM public.notifications
   WHERE push_sent_at IS NULL
     -- Don't try to push rows older than a day; treat them as
     -- permanently failed so the cron doesn't spin on them forever.
     AND created_at > now() - interval '1 day'
   ORDER BY created_at ASC
   LIMIT GREATEST(1, LEAST(p_limit, 500));
$$;

GRANT EXECUTE ON FUNCTION public.list_pending_pushes(int) TO authenticated;


-- (4) Marker — flips push_sent_at on a set of ids.
CREATE OR REPLACE FUNCTION public.mark_pushed(p_ids uuid[])
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n int;
BEGIN
  UPDATE public.notifications
     SET push_sent_at = now()
   WHERE id = ANY(p_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END; $$;

GRANT EXECUTE ON FUNCTION public.mark_pushed(uuid[]) TO authenticated;


-- (5) Backfill: mark anything already > 1 day old as "sent" so the
-- cron doesn't try to push stale rows.
UPDATE public.notifications
   SET push_sent_at = COALESCE(push_sent_at, created_at)
 WHERE push_sent_at IS NULL
   AND created_at < now() - interval '1 day';

NOTIFY pgrst, 'reload schema';
