-- =====================================================================
-- CP-42 — "Check-in available" / "Spin ready" notification
-- =====================================================================
-- Andrew wants the customer to get a phone notification the moment
-- their 12-hour check-in cooldown ends so they think to come back
-- and spin the mystery reward.
--
-- We can't reliably "fire after N hours" without a job scheduler.
-- Cleanest approach: when a new check-in lands (i.e. cooldown begins),
-- we schedule an in-app notification + push for exactly 12 hours later
-- by inserting a row into a small queue table that a tiny scheduled
-- function fires on. Combined with pg_cron, the queue gets drained
-- every 5 minutes and the customer's phone pings as soon after the
-- 12h boundary as the cron runs.
--
-- This migration:
--   1. Creates public.notification_queue (id, fire_at, payload).
--   2. Trigger on check_in_events: queue a notif for now + 12h.
--   3. fire_due_notifications() RPC that drains the queue —
--      moves due rows into public.notifications (the push fanout
--      trigger handles the actual phone push).
--   4. Documents the pg_cron snippet to schedule the drain.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.notification_queue (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fire_at      timestamptz NOT NULL,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id  uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  kind         text NOT NULL,
  title        text NOT NULL,
  body         text,
  link_path    text,
  fired_at     timestamptz,
  -- Idempotency key: if a row with the same key + future fire_at
  -- already exists for this user, we skip re-queuing.
  dedupe_key   text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notif_queue_due_idx
  ON public.notification_queue (fire_at)
  WHERE fired_at IS NULL;

CREATE INDEX IF NOT EXISTS notif_queue_dedupe_idx
  ON public.notification_queue (user_id, dedupe_key, fired_at);


-- Trigger: when a check-in is recorded, schedule a "check-in available"
-- push for 12 hours from now. Idempotent on the dedupe key so multiple
-- rapid check-ins don't queue multiple pings.
CREATE OR REPLACE FUNCTION public._queue_checkin_available_notif()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid;
  v_business uuid;
  v_business_name text;
  v_fire_at timestamptz;
  v_dedupe text;
  v_has_spin boolean;
BEGIN
  -- Pull user + business name for the message.
  SELECT m.user_id, m.business_id, b.name
    INTO v_user, v_business, v_business_name
    FROM public.business_memberships m
    JOIN public.businesses b ON b.id = m.business_id
   WHERE m.id = NEW.membership_id;
  IF v_user IS NULL THEN RETURN NEW; END IF;

  v_fire_at := now() + interval '12 hours';
  v_dedupe  := 'checkin_avail:' || v_business::text;

  -- Skip if a future row is already queued for this user + business.
  IF EXISTS (
    SELECT 1 FROM public.notification_queue
     WHERE user_id = v_user
       AND dedupe_key = v_dedupe
       AND fired_at IS NULL
       AND fire_at > now()
  ) THEN
    RETURN NEW;
  END IF;

  -- Does this business have mystery spin enabled? If yes, customize
  -- the copy to say "spin is ready". Otherwise just "check in again".
  SELECT COALESCE(is_enabled, false) INTO v_has_spin
    FROM public.business_mystery_config
   WHERE business_id = v_business;

  INSERT INTO public.notification_queue
    (fire_at, user_id, business_id, kind, title, body, link_path, dedupe_key)
  VALUES (
    v_fire_at, v_user, v_business, 'check_in_available',
    CASE WHEN v_has_spin
         THEN '🎰 Your spin is ready at ' || COALESCE(v_business_name, 'your spot')
         ELSE '✨ You can check in again'
    END,
    CASE WHEN v_has_spin
         THEN 'Come back and spin for a surprise reward.'
         ELSE 'Stop by and scan to keep your streak going.'
    END,
    '/app/scan',
    v_dedupe
  );

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_queue_checkin_avail ON public.check_in_events;
CREATE TRIGGER trg_queue_checkin_avail
  AFTER INSERT ON public.check_in_events
  FOR EACH ROW EXECUTE FUNCTION public._queue_checkin_available_notif();


-- Drain: move due rows from the queue into public.notifications.
-- The CP-42 push-fanout trigger on notifications takes care of the
-- actual phone push.
CREATE OR REPLACE FUNCTION public.fire_due_notifications()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int := 0;
BEGIN
  WITH due AS (
    SELECT id, user_id, business_id, kind, title, body, link_path
      FROM public.notification_queue
     WHERE fired_at IS NULL
       AND fire_at <= now()
     LIMIT 200
     FOR UPDATE SKIP LOCKED
  ),
  ins AS (
    INSERT INTO public.notifications
      (user_id, business_id, kind, title, body, link_path)
    SELECT user_id, business_id, kind, title, body, link_path
      FROM due
    RETURNING 1
  ),
  upd AS (
    UPDATE public.notification_queue
       SET fired_at = now()
     WHERE id IN (SELECT id FROM due)
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM ins;

  RETURN v_count;
END; $$;

GRANT EXECUTE ON FUNCTION public.fire_due_notifications() TO authenticated, service_role;

-- pg_cron setup (run once from Supabase SQL editor):
--   SELECT cron.schedule(
--     'atlas-fire-due-notifs', '*/2 * * * *',  -- every 2 minutes
--     $$ SELECT public.fire_due_notifications(); $$
--   );

NOTIFY pgrst, 'reload schema';
