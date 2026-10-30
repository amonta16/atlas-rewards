-- =====================================================================
-- CP-42 v2 — Welcome gift, properly per-member + voice memo
-- =====================================================================
-- v1 (in cp42_welcome_gift_trigger.sql) had two bugs Andrew caught:
--   1) Every new signup created a fresh row in public.offers — which
--      is the BUSINESS-WIDE offer table. Existing members saw a new
--      welcome banner every time anyone signed up. Bad.
--   2) The voice_message_url from business_automated_offers wasn't
--      copied onto the offer, so the customer's banner had no audio.
--
-- Fix:
--   • Add voice_message_url + is_welcome_template columns to offers.
--   • Find-or-create ONE master "welcome gift" offers row per business
--     per active welcome automated-offer config. Master row carries
--     the title, body, image, voice memo, and a long expiration.
--   • For each new member, INSERT a customer_saved_offers row
--     (membership_id, offer_id). UNIQUE constraint dedupes so a
--     re-signin / re-enroll can't double-add.
--   • Customer Home is unchanged; the existing SavedGiftsSection +
--     featured-offer banner already render saved gifts including
--     voice_message_url.
--   • Drops the v1 trigger first so this is safe to run after v1.
--
-- Self-contained, idempotent.
-- =====================================================================

-- (1) Voice memo column on offers — so the featured-offer banner can
--     play the audio attached to an automated offer.
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS voice_message_url text;

-- (2) Tag the master welcome offer so we can find it without title
--     fuzzy-matching.
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS welcome_config_id uuid
    REFERENCES public.business_automated_offers(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS offers_welcome_master_uniq
  ON public.offers (welcome_config_id)
  WHERE welcome_config_id IS NOT NULL;


-- (3) Drop the v1 trigger + function. Replaced below.
DROP TRIGGER IF EXISTS trg_welcome_gift ON public.business_memberships;
DROP FUNCTION IF EXISTS public._fire_welcome_gifts_for_new_member();


-- (4) v2 trigger: find-or-create master offer + per-member save.
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
BEGIN
  FOR o IN
    SELECT bao.id            AS config_id,
           bao.custom_title,
           bao.custom_description,
           bao.custom_image_url,
           bao.voice_message_url,
           bao.expires_after_days,
           t.slug             AS template_slug,
           t.name             AS template_name,
           t.emoji            AS template_emoji,
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

    -- Find or create the MASTER offer row for this welcome config.
    -- Only one row exists per config_id thanks to the unique index above.
    SELECT id INTO v_master
      FROM public.offers
     WHERE welcome_config_id = o.config_id;

    IF v_master IS NULL THEN
      BEGIN
        INSERT INTO public.offers (
          business_id, title, description, image_url, voice_message_url,
          expires_at, is_active, is_featured, welcome_config_id
        )
        VALUES (
          NEW.business_id, v_title, v_body, v_image, v_voice,
          v_expires, true, false, o.config_id
        )
        RETURNING id INTO v_master;
      EXCEPTION WHEN unique_violation THEN
        -- Race: another concurrent insert beat us to it. Re-fetch.
        SELECT id INTO v_master
          FROM public.offers WHERE welcome_config_id = o.config_id;
      WHEN OTHERS THEN
        RAISE WARNING 'welcome master offer insert failed: %', SQLERRM;
        v_master := NULL;
      END;
    ELSE
      -- Keep the master fresh — refresh title/body/image/voice/expiry
      -- so edits to the automated offer config show up on next signup.
      UPDATE public.offers
         SET title             = v_title,
             description       = v_body,
             image_url         = v_image,
             voice_message_url = v_voice,
             expires_at        = v_expires,
             is_active         = true
       WHERE id = v_master;
    END IF;

    IF v_master IS NOT NULL THEN
      -- Per-member save. UNIQUE (membership_id, offer_id) means a
      -- second enroll attempt is a no-op. This is what makes the gift
      -- PERSONAL: only this member sees it on their SavedGiftsSection
      -- (other customers don't see a welcome banner every signup).
      BEGIN
        INSERT INTO public.customer_saved_offers
          (membership_id, offer_id, business_id)
        VALUES
          (NEW.id, v_master, NEW.business_id)
        ON CONFLICT (membership_id, offer_id) DO NOTHING;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'welcome gift saved_offer insert failed: %', SQLERRM;
      END;

      -- In-app notification (push fan-out automatic via cp42 trigger).
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

NOTIFY pgrst, 'reload schema';
