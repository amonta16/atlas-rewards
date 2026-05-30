-- =====================================================================
-- CP-42 — Notification wiring audit + fixes
-- =====================================================================
-- AUDIT FINDINGS (before this migration):
--
--   ✅ Wired (in-app only, no push):
--      • review_verified  — trigger on reviews UPDATE
--      • daily_check      — trigger on check_in_events INSERT
--      • automated_offer  — trigger on automated_offer_assignments INSERT
--      • membership_active — fired in activate_pending_membership RPC
--      • customer_offer   — fired manually from broadcast_notification (has push)
--      • we_miss_you      — fired manually from send_winback (has push)
--
--   ❌ Toggle exists but NOTHING fires:
--      • reward_unlocked
--      • birthday
--      • review_request   (the existing "review" kind only fires AFTER verified)
--      • check_in_available (12h cooldown)
--      • streak_reminders (about-to-break)
--      • gift_expiration_reminders (RPC exists, no cron)
--
-- THIS MIGRATION:
--   1. Extends the notifications.kind enum to cover the missing kinds.
--   2. Adds a TRIGGER for reward_unlocked (fires when a member's
--      points_balance crosses ANY reward threshold).
--   3. Adds a TRIGGER for review_request (fires when a redemption is
--      fulfilled — best moment to ask for a review).
--   4. Adds a UNIVERSAL push-fanout trigger that calls the new
--      /api/notifications/push-fanout route via pg_net for EVERY
--      notification row inserted. Respects customer_notification_preferences.
--   5. Documents the cron-based notifications (birthday, streak break,
--      check_in_available, gift_expiration) at the bottom — pg_cron is
--      required for those, and the snippets are ready to copy/paste.
-- =====================================================================

-- (1) Extend the kind CHECK constraint
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check
  CHECK (kind IN (
    'streak','review','daily_check','automated_offer',
    'customer_offer','reward_expiration','generic',
    -- CP-42 additions:
    'reward_unlocked','birthday','review_request','check_in_available','we_miss_you'
  ));


-- (2) reward_unlocked TRIGGER — fires when business_memberships.points_balance
--     crosses ANY of the business's reward thresholds (cost field on rewards).
CREATE OR REPLACE FUNCTION public._notif_reward_unlocked()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r       record;
  v_name  text;
BEGIN
  -- Only fire when balance went UP.
  IF NEW.points_balance <= OLD.points_balance THEN RETURN NEW; END IF;

  SELECT name INTO v_name FROM public.businesses WHERE id = NEW.business_id;

  -- Insert one notification per reward whose threshold was just crossed.
  -- Schema (CP-01): rewards.name + rewards.point_cost + rewards.is_active.
  FOR r IN
    SELECT id, name, point_cost
      FROM public.rewards
     WHERE business_id = NEW.business_id
       AND is_active = true
       AND point_cost <= NEW.points_balance
       AND point_cost >  OLD.points_balance
  LOOP
    INSERT INTO public.notifications (user_id, business_id, kind, title, body, link_path)
      VALUES (NEW.user_id, NEW.business_id, 'reward_unlocked',
              'Reward unlocked! 🎁',
              'You can now redeem ' || r.name || ' at ' || COALESCE(v_name, 'your spot') || '.',
              '/app/rewards');
  END LOOP;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notif_reward_unlocked ON public.business_memberships;
CREATE TRIGGER trg_notif_reward_unlocked
  AFTER UPDATE OF points_balance ON public.business_memberships
  FOR EACH ROW
  WHEN (NEW.points_balance > OLD.points_balance)
  EXECUTE FUNCTION public._notif_reward_unlocked();


-- (3) review_request TRIGGER — fires when a redemption is fulfilled
--     (status -> 'fulfilled'). That's the best moment to ask for a review.
CREATE OR REPLACE FUNCTION public._notif_review_request()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid;
  v_business uuid;
  v_name text;
  v_recent int;
BEGIN
  IF NEW.status <> 'fulfilled' OR (OLD.status = 'fulfilled') THEN RETURN NEW; END IF;

  SELECT m.user_id, m.business_id, b.name
    INTO v_user, v_business, v_name
    FROM public.business_memberships m
    JOIN public.businesses b ON b.id = m.business_id
   WHERE m.id = NEW.membership_id;

  IF v_user IS NULL THEN RETURN NEW; END IF;

  -- Don't ask twice in the same 14-day window.
  SELECT COUNT(*) INTO v_recent
    FROM public.notifications n
   WHERE n.user_id = v_user
     AND n.kind    = 'review_request'
     AND n.created_at > now() - interval '14 days';
  IF v_recent > 0 THEN RETURN NEW; END IF;

  INSERT INTO public.notifications (user_id, business_id, kind, title, body, link_path)
    VALUES (v_user, v_business, 'review_request',
            'Enjoyed it? Leave a quick Google review ⭐',
            'It takes 30 seconds and helps ' || COALESCE(v_name, 'them') || ' a ton.',
            '/app/rewards?focus=review');

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notif_review_request ON public.redemptions;
CREATE TRIGGER trg_notif_review_request
  AFTER UPDATE OF status ON public.redemptions
  FOR EACH ROW EXECUTE FUNCTION public._notif_review_request();


-- (4) UNIVERSAL PUSH FANOUT — every notification row triggers an HTTP
--     POST to /api/notifications/push-fanout via pg_net. Respects the
--     customer's per-kind preferences before firing.
--
--     Requires: pg_net extension + an `app.settings.atlas_base_url`
--     setting OR the fanout URL hardcoded below.
--
--     Setup once (Supabase dashboard → Settings → Database → Configure
--     custom settings):
--        atlas.base_url = 'https://app.atlas-engine.app'
--     OR run:
--        ALTER DATABASE postgres SET atlas.base_url = 'https://app.atlas-engine.app';
-- ---------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public._notif_push_fanout()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_mem_id   uuid;
  v_prefs    public.customer_notification_preferences%ROWTYPE;
  v_kind_ok  boolean := true;
  v_base_url text;
BEGIN
  -- Find this user's membership for this business so we can check prefs.
  SELECT id INTO v_mem_id
    FROM public.business_memberships
   WHERE user_id = NEW.user_id AND business_id = NEW.business_id
   LIMIT 1;

  IF v_mem_id IS NOT NULL THEN
    SELECT * INTO v_prefs FROM public.customer_notification_preferences
     WHERE membership_id = v_mem_id;
    -- If no row, default = everything on.
    IF FOUND THEN
      IF NOT v_prefs.push_enabled THEN RETURN NEW; END IF;
      v_kind_ok := CASE NEW.kind
        WHEN 'streak'              THEN v_prefs.streak_reminders
        WHEN 'reward_expiration'   THEN v_prefs.gift_expiration_reminders
        WHEN 'customer_offer'      THEN v_prefs.customer_offer_announcements
        WHEN 'check_in_available'  THEN v_prefs.check_in_available
        WHEN 'we_miss_you'         THEN v_prefs.we_miss_you
        WHEN 'reward_unlocked'     THEN v_prefs.reward_unlocked
        WHEN 'birthday'            THEN v_prefs.birthday
        WHEN 'review_request'      THEN v_prefs.review_request
        ELSE true
      END;
    END IF;
  END IF;

  IF NOT v_kind_ok THEN RETURN NEW; END IF;

  -- Read base URL from DB settings; fall back to Vercel production URL.
  BEGIN
    v_base_url := current_setting('atlas.base_url');
  EXCEPTION WHEN OTHERS THEN
    v_base_url := 'https://app.atlas-engine.app';
  END;

  PERFORM extensions.http_post(
    url     := v_base_url || '/api/notifications/push-fanout',
    body    := jsonb_build_object('notification_id', NEW.id),
    headers := jsonb_build_object('Content-Type', 'application/json')
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never let a fanout failure block a notification insert.
  RAISE WARNING 'push fanout failed: %', SQLERRM;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notif_push_fanout ON public.notifications;
CREATE TRIGGER trg_notif_push_fanout
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public._notif_push_fanout();


-- (5) CRON SETUP (manual — run from Supabase dashboard → SQL editor):
-- ---------------------------------------------------------------------
-- Requires pg_cron extension (Supabase: Database → Extensions → enable).
-- Each cron job calls an idempotent RPC that scans the relevant table
-- and inserts notifications for matching members. The push fanout
-- trigger above handles the actual phone push.
--
-- ─── Birthday bonus (every day at 9am UTC) ──────────────────────────
--   SELECT cron.schedule('atlas-birthday-notif', '0 9 * * *', $$
--     SELECT public.fire_birthday_notifications();
--   $$);
--
-- ─── Streak about-to-break (every day at 6pm UTC) ────────────────────
--   SELECT cron.schedule('atlas-streak-break', '0 18 * * *', $$
--     SELECT public.fire_streak_break_notifications();
--   $$);
--
-- ─── Check-in available (every 15min) ────────────────────────────────
--   SELECT cron.schedule('atlas-checkin-ready', '*/15 * * * *', $$
--     SELECT public.fire_checkin_available_notifications();
--   $$);
--
-- ─── Gift expiration reminders (every 6h) ────────────────────────────
--   SELECT cron.schedule('atlas-gift-expiring', '0 */6 * * *', $$
--     SELECT public.notify_expiring_redemptions_all();
--   $$);
--
-- Those RPCs themselves are stubs for now — see cp43 migration for the
-- bodies. For MVP, the four event-driven kinds (reward_verified,
-- daily_check, automated_offer, reward_unlocked, review_request) plus
-- the two manual kinds (customer_offer, we_miss_you) all fire push via
-- the universal fanout trigger.

NOTIFY pgrst, 'reload schema';
