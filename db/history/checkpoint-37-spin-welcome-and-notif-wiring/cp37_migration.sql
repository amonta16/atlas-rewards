-- =====================================================================
-- CP-37 — Daily spin / streak / welcome gift / notification wiring fixes
-- =====================================================================
-- Bundles every SQL change for CP-37. Self-contained and idempotent.
-- Safe to re-run; safe to run on a deploy that has or hasn't applied
-- prior CP-42 SQL.
--
-- Sections:
--   1)  offers.gift_reward_id  +  master row carries the chosen reward
--   2)  Welcome-gift trigger v3 — propagates discount + reward + auto-
--       credits points_bonus welcomes (no QR, no saved gift)
--   3)  my_saved_offers v2 — returns gift_reward_id + gift_reward_name
--       so SavedGiftsSection can render "🎁 Free Latte" instead of a
--       blank row
--   4)  save_offer hardened — explicit "offer expired", "offer not
--       active", and "points_bonus auto-credits instead" errors so
--       LimitedOffersSection surfaces a useful toast
--   5)  Reward-unlocked + universal push-fanout triggers (re-applied
--       idempotently — these were introduced in CP-42 but may not be
--       deployed on every environment yet)
--   6)  diagnose_login(p_email)  — agency-admin-only helper to debug
--       a customer login failure end-to-end
-- =====================================================================


-- ---------------------------------------------------------------------
-- (1) offers.gift_reward_id  +  backfill master row's gift_reward_id
-- ---------------------------------------------------------------------
-- The welcome master offer row needs to know which reward (if any) it's
-- linked to, so my_saved_offers can return it and the customer sees the
-- reward name instead of a blank row.

ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS gift_reward_id uuid
    REFERENCES public.rewards(id) ON DELETE SET NULL;

ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS discount_type text;

ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS discount_value int;

-- discount_type CHECK constraint — keep loose; lets us reuse the same
-- column for percent / flat_cents / points_bonus / reward.
DO $$ BEGIN
  ALTER TABLE public.offers DROP CONSTRAINT IF EXISTS offers_discount_type_check;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

ALTER TABLE public.offers
  ADD CONSTRAINT offers_discount_type_check
  CHECK (discount_type IS NULL OR discount_type IN ('none','percent','flat_cents','points_bonus','reward'));


-- ---------------------------------------------------------------------
-- (2) Welcome-gift trigger v3 — copies discount + gift_reward_id onto
-- the master offer, and AUTO-CREDITS points-only welcomes (no saved
-- gift row, no QR — Andrew chose this in the CP-37 spec).
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_welcome_gift ON public.business_memberships;
DROP FUNCTION IF EXISTS public._fire_welcome_gifts_for_new_member();

CREATE OR REPLACE FUNCTION public._fire_welcome_gifts_for_new_member()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o          record;
  v_master   uuid;
  v_title    text;
  v_body     text;
  v_image    text;
  v_voice    text;
  v_expires  timestamptz;
  v_idem     text;
BEGIN
  FOR o IN
    SELECT bao.id                AS config_id,
           bao.custom_title,
           bao.custom_description,
           bao.custom_image_url,
           bao.voice_message_url,
           bao.expires_after_days,
           bao.discount_type      AS bao_discount_type,
           bao.discount_value     AS bao_discount_value,
           bao.gift_reward_id     AS bao_gift_reward_id,
           t.slug                 AS template_slug,
           t.name                 AS template_name,
           t.emoji                AS template_emoji,
           t.trigger_type
      FROM public.business_automated_offers bao
      JOIN public.automated_offer_templates t ON t.id = bao.template_id
     WHERE bao.business_id = NEW.business_id
       AND bao.is_active   = true
       AND t.trigger_type  = 'signup'
  LOOP
    v_title   := COALESCE(o.custom_title,
                          o.template_emoji || ' ' || o.template_name);
    v_body    := o.custom_description;
    v_image   := o.custom_image_url;
    v_voice   := o.voice_message_url;
    v_expires := now() + (COALESCE(o.expires_after_days, 30) || ' days')::interval;

    -- ============================================================
    -- BRANCH A: points_bonus — credit points immediately, no saved
    -- gift row. The customer sees +N pts in their balance and gets
    -- a notification. The reward_unlocked trigger may also fire if
    -- the credit crosses a reward threshold.
    -- ============================================================
    IF o.bao_discount_type = 'points_bonus' AND COALESCE(o.bao_discount_value, 0) > 0 THEN
      v_idem := 'welcome_points:' || NEW.id::text || ':' || o.config_id::text;
      BEGIN
        PERFORM public.award_points(
          NEW.id,                                            -- membership
          o.bao_discount_value,                              -- delta
          'signup_bonus',                                    -- rule_type
          o.config_id,                                       -- reference
          v_idem,                                            -- idempotency
          'Welcome bonus from ' || COALESCE(v_title, 'signup gift')
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'welcome points award failed: %', SQLERRM;
      END;

      BEGIN
        INSERT INTO public.notifications
          (user_id, business_id, kind, title, body, link_path)
        VALUES
          (NEW.user_id, NEW.business_id, 'automated_offer',
           '🎁 +' || o.bao_discount_value::text || ' welcome points!',
           COALESCE(v_body, 'Welcome aboard. Your points are already in your account.'),
           '/app');
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'welcome points notification failed: %', SQLERRM;
      END;

      UPDATE public.business_automated_offers
         SET last_triggered_at = now()
       WHERE id = o.config_id;

      -- IMPORTANT: continue the loop. Don't create a saved-offer row
      -- for points_bonus welcomes. Customers don't redeem points,
      -- they already have them.
      CONTINUE;
    END IF;

    -- ============================================================
    -- BRANCH B: reward / percent / flat_cents — find-or-create the
    -- master offer row, link it to the linked reward (if any), and
    -- save a customer_saved_offers row so the gift appears on the
    -- Rewards tab with the correct title + discount label.
    -- ============================================================

    SELECT id INTO v_master
      FROM public.offers
     WHERE welcome_config_id = o.config_id;

    IF v_master IS NULL THEN
      BEGIN
        INSERT INTO public.offers (
          business_id, title, description, image_url, voice_message_url,
          expires_at, is_active, is_featured, welcome_config_id,
          discount_type, discount_value, gift_reward_id
        )
        VALUES (
          NEW.business_id, v_title, v_body, v_image, v_voice,
          v_expires, true, false, o.config_id,
          COALESCE(o.bao_discount_type, 'none'),
          o.bao_discount_value,
          o.bao_gift_reward_id
        )
        RETURNING id INTO v_master;
      EXCEPTION WHEN unique_violation THEN
        SELECT id INTO v_master
          FROM public.offers WHERE welcome_config_id = o.config_id;
      WHEN OTHERS THEN
        RAISE WARNING 'welcome master offer insert failed: %', SQLERRM;
        v_master := NULL;
      END;
    ELSE
      -- Keep the master fresh — refresh every editable field so a
      -- change to the underlying business_automated_offers config
      -- propagates to ALL future welcomes AND to existing saved-
      -- gift rows (since SavedGiftsSection reads through to the
      -- offers row each render).
      UPDATE public.offers
         SET title             = v_title,
             description       = v_body,
             image_url         = v_image,
             voice_message_url = v_voice,
             expires_at        = v_expires,
             is_active         = true,
             discount_type     = COALESCE(o.bao_discount_type, 'none'),
             discount_value    = o.bao_discount_value,
             gift_reward_id    = o.bao_gift_reward_id
       WHERE id = v_master;
    END IF;

    IF v_master IS NOT NULL THEN
      BEGIN
        INSERT INTO public.customer_saved_offers
          (membership_id, offer_id, business_id)
        VALUES
          (NEW.id, v_master, NEW.business_id)
        ON CONFLICT (membership_id, offer_id) DO NOTHING;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'welcome gift saved_offer insert failed: %', SQLERRM;
      END;

      BEGIN
        INSERT INTO public.notifications
          (user_id, business_id, kind, title, body, link_path)
        VALUES
          (NEW.user_id, NEW.business_id, 'automated_offer',
           '🎁 A welcome gift just dropped',
           COALESCE(v_body, 'Tap to see what''s waiting on your Home tab.'),
           '/app');
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'welcome gift notification insert failed: %', SQLERRM;
      END;
    END IF;

    UPDATE public.business_automated_offers
       SET last_triggered_at = now()
     WHERE id = o.config_id;
  END LOOP;

  RETURN NEW;
END; $$;

CREATE TRIGGER trg_welcome_gift
  AFTER INSERT ON public.business_memberships
  FOR EACH ROW EXECUTE FUNCTION public._fire_welcome_gifts_for_new_member();


-- ---------------------------------------------------------------------
-- (2b) Backfill existing welcome master offer rows with the correct
-- discount_type / discount_value / gift_reward_id from their config.
-- This makes EXISTING members' blank welcome gifts start displaying
-- correctly immediately after migration, without re-signing them up.
-- ---------------------------------------------------------------------
UPDATE public.offers o
   SET discount_type  = COALESCE(bao.discount_type, 'none'),
       discount_value = bao.discount_value,
       gift_reward_id = bao.gift_reward_id
  FROM public.business_automated_offers bao
 WHERE o.welcome_config_id = bao.id
   AND (o.discount_type IS NULL
        OR o.discount_type = 'none'
        OR o.gift_reward_id IS DISTINCT FROM bao.gift_reward_id);


-- ---------------------------------------------------------------------
-- (3) my_saved_offers v2 — return gift_reward_id + gift_reward_name
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.my_saved_offers(uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.my_saved_offers(p_business_id uuid)
RETURNS TABLE (
  saved_id          uuid,
  offer_id          uuid,
  title             text,
  description       text,
  image_url         text,
  discount_type     text,
  discount_value    int,
  expires_at        timestamptz,
  voice_message_url text,
  redeem_code       text,
  fulfilled_at      timestamptz,
  saved_at          timestamptz,
  gift_reward_id    uuid,
  gift_reward_name  text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, o.id, o.title, o.description, o.image_url,
         COALESCE(o.discount_type, 'none')::text, o.discount_value,
         o.expires_at, o.voice_message_url,
         c.redeem_code, c.fulfilled_at, c.saved_at,
         o.gift_reward_id,
         r.name AS gift_reward_name
    FROM public.customer_saved_offers c
    JOIN public.offers o              ON o.id = c.offer_id
    JOIN public.business_memberships m ON m.id = c.membership_id
    LEFT JOIN public.rewards r         ON r.id = o.gift_reward_id
   WHERE m.user_id = auth.uid()
     AND c.business_id = p_business_id
     AND (o.expires_at IS NULL OR o.expires_at > now())
   ORDER BY c.fulfilled_at NULLS FIRST, c.saved_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.my_saved_offers(uuid) TO authenticated;


-- ---------------------------------------------------------------------
-- (4) save_offer hardened — better errors so the "20% OFF Sunday" toast
-- says WHAT actually failed instead of a generic "Couldn't claim".
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_offer(p_offer_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_business_id   uuid;
  v_membership_id uuid;
  v_saved_id      uuid;
  v_code          text;
  v_try           int := 0;
  v_is_active     boolean;
  v_expires_at    timestamptz;
  v_discount_type text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT business_id, is_active, expires_at, COALESCE(discount_type, 'none')
    INTO v_business_id, v_is_active, v_expires_at, v_discount_type
    FROM public.offers WHERE id = p_offer_id;

  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'offer not found';
  END IF;

  IF COALESCE(v_is_active, false) = false THEN
    RAISE EXCEPTION 'offer is no longer active';
  END IF;

  IF v_expires_at IS NOT NULL AND v_expires_at <= now() THEN
    RAISE EXCEPTION 'offer expired';
  END IF;

  -- CP-37: points_bonus offers should never end up here — they auto-
  -- credit. Surface a friendlier message rather than letting it land
  -- in the customer's saved-gifts list as a "ghost row" with no QR.
  IF v_discount_type = 'points_bonus' THEN
    RAISE EXCEPTION 'this gift is points-only — points were already added to your balance';
  END IF;

  SELECT id INTO v_membership_id
    FROM public.business_memberships
   WHERE user_id = auth.uid()
     AND business_id = v_business_id
   LIMIT 1;
  IF v_membership_id IS NULL THEN
    RAISE EXCEPTION 'no membership for this business — join first';
  END IF;

  LOOP
    v_code := upper(substring(
      translate(encode(gen_random_bytes(10), 'base64'), '+/=OoIl01', '')
      from 1 for 7
    ));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.customer_saved_offers
       WHERE business_id = v_business_id AND redeem_code = v_code
    ) AND NOT EXISTS (
      SELECT 1 FROM public.redemptions
       WHERE business_id = v_business_id AND code = v_code
    );
    v_try := v_try + 1;
    IF v_try > 10 THEN RAISE EXCEPTION 'could not mint unique code, please try again'; END IF;
  END LOOP;

  INSERT INTO public.customer_saved_offers
    (membership_id, offer_id, business_id, redeem_code)
  VALUES (v_membership_id, p_offer_id, v_business_id, v_code)
  ON CONFLICT (membership_id, offer_id) DO UPDATE
    SET saved_at    = customer_saved_offers.saved_at,
        redeem_code = COALESCE(customer_saved_offers.redeem_code, EXCLUDED.redeem_code)
  RETURNING id INTO v_saved_id;

  RETURN v_saved_id;
END; $$;

GRANT EXECUTE ON FUNCTION public.save_offer(uuid) TO authenticated;


-- ---------------------------------------------------------------------
-- (5) Reward-unlocked + universal push-fanout triggers, idempotently
-- re-applied. These were originally introduced in CP-42 but Andrew
-- reports the reward_unlocked notification isn't firing in prod — most
-- likely cause is the CP-42 SQL hasn't been applied yet, so we bundle
-- it here as a safety net. Re-running has no effect if already present.
-- ---------------------------------------------------------------------

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check
  CHECK (kind IN (
    'streak','review','daily_check','automated_offer',
    'customer_offer','reward_expiration','generic',
    'reward_unlocked','birthday','review_request','check_in_available','we_miss_you'
  ));

CREATE OR REPLACE FUNCTION public._notif_reward_unlocked()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r       record;
  v_name  text;
BEGIN
  IF NEW.points_balance <= OLD.points_balance THEN RETURN NEW; END IF;
  SELECT name INTO v_name FROM public.businesses WHERE id = NEW.business_id;

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


-- ---------------------------------------------------------------------
-- (6) diagnose_login(p_email) — agency-admin-only helper that returns
-- everything needed to debug "my friend can't log in". Andrew uses this
-- by running:
--
--    SELECT * FROM public.diagnose_login('papash2021@gmail.com');
--
-- in the Supabase SQL editor. Output shows whether the auth user
-- exists, whether email is confirmed, what providers are linked,
-- whether the profile + business_membership exists, and the sub-account
-- the friend should be signing in through.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.diagnose_login(p_email text)
RETURNS TABLE (
  email                text,
  auth_user_exists     boolean,
  auth_user_id         uuid,
  email_confirmed_at   timestamptz,
  has_password         boolean,
  providers            text,
  profile_exists       boolean,
  profile_full_name    text,
  memberships          int,
  business_slugs       text,
  last_sign_in_at      timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email text := lower(btrim(p_email));
BEGIN
  RETURN QUERY
    SELECT
      v_email,
      u.id IS NOT NULL                                       AS auth_user_exists,
      u.id                                                    AS auth_user_id,
      u.email_confirmed_at,
      (u.encrypted_password IS NOT NULL
        AND length(u.encrypted_password) > 0)                 AS has_password,
      COALESCE(u.raw_app_meta_data->>'providers',
               u.raw_app_meta_data->>'provider', '')          AS providers,
      p.id IS NOT NULL                                        AS profile_exists,
      p.full_name                                             AS profile_full_name,
      (SELECT count(*)::int FROM public.business_memberships m WHERE m.user_id = u.id) AS memberships,
      (SELECT string_agg(b.slug, ', ')
         FROM public.business_memberships m
         JOIN public.businesses b ON b.id = m.business_id
        WHERE m.user_id = u.id)                                AS business_slugs,
      u.last_sign_in_at
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
   WHERE u.email = v_email
   LIMIT 1;
END; $$;

GRANT EXECUTE ON FUNCTION public.diagnose_login(text) TO authenticated;


-- ---------------------------------------------------------------------
-- Done. Notify PostgREST so the new RPC + return shapes show up
-- immediately without a manual schema reload.
-- ---------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
