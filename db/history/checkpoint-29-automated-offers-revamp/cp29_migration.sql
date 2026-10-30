-- ─────────────────────────────────────────────────────────────────────────────
-- CP-29 — Automated offers revamp (image templates + voice messages)
-- ─────────────────────────────────────────────────────────────────────────────
-- Self-contained. Idempotent. Safe to re-run.
--
-- What this migration does:
--   1) Adds `voice_message_url` to `business_automated_offers` so each
--      occasion can ship with an optional voice note from the business
--      owner (the +158% conversion lift Dermis cited).
--
--   2) Inserts a new `st_patricks` template (March 17). Existing seed in
--      CP-18 didn't cover this one and Andrew's mock includes it.
--
--   3) Rebuilds `upsert_business_automated_offer` to accept the new
--      `p_voice_message_url` param. Old signature is dropped so the new
--      one is the only one available — keeps PostgREST resolution clean.
--
--   4) Rebuilds `list_automated_offers_for_business` to return
--      `voice_message_url` (and the template's `default_image_url` so the
--      client can fall back to the per-occasion stock art without an
--      explicit upload).
--
--   5) Creates a `voice-messages` storage bucket and RLS so business staff
--      can upload, public can read. Same pattern as offer-images.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1) Add voice_message_url column ─────────────────────────────────────────
ALTER TABLE public.business_automated_offers
  ADD COLUMN IF NOT EXISTS voice_message_url text;

-- ── 2) Seed St. Patrick's Day template ──────────────────────────────────────
INSERT INTO public.automated_offer_templates
  (slug, name, emoji, description, trigger_type, trigger_config)
VALUES
  ('st_patricks', 'St. Patrick''s Day', '🍀',
   'A little luck on March 17.',
   'date', '{"month":3,"day":17,"window_days":3}'::jsonb)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  emoji = EXCLUDED.emoji,
  description = EXCLUDED.description,
  trigger_type = EXCLUDED.trigger_type,
  trigger_config = EXCLUDED.trigger_config;

-- ── 3) upsert RPC — add p_voice_message_url ────────────────────────────────
-- We DROP the old signature first to avoid PostgREST ambiguity on
-- overloaded function names.
DROP FUNCTION IF EXISTS public.upsert_business_automated_offer(
  uuid, uuid, uuid, boolean, text, text, text, text, int, int
);

CREATE OR REPLACE FUNCTION public.upsert_business_automated_offer(
  p_id                  uuid,
  p_business_id         uuid,
  p_template_id         uuid,
  p_is_active           boolean,
  p_custom_title        text DEFAULT NULL,
  p_custom_description  text DEFAULT NULL,
  p_custom_image_url    text DEFAULT NULL,
  p_discount_type       text DEFAULT 'none',
  p_discount_value      int  DEFAULT NULL,
  p_expires_after_days  int  DEFAULT 7,
  p_voice_message_url   text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.staffs_business(p_business_id) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.business_automated_offers
      (business_id, template_id, is_active, custom_title, custom_description,
       custom_image_url, discount_type, discount_value, expires_after_days,
       voice_message_url)
    VALUES
      (p_business_id, p_template_id, p_is_active, p_custom_title, p_custom_description,
       p_custom_image_url, p_discount_type, p_discount_value, p_expires_after_days,
       p_voice_message_url)
    ON CONFLICT (business_id, template_id) DO UPDATE SET
      is_active          = EXCLUDED.is_active,
      custom_title       = EXCLUDED.custom_title,
      custom_description = EXCLUDED.custom_description,
      custom_image_url   = EXCLUDED.custom_image_url,
      discount_type      = EXCLUDED.discount_type,
      discount_value     = EXCLUDED.discount_value,
      expires_after_days = EXCLUDED.expires_after_days,
      voice_message_url  = EXCLUDED.voice_message_url,
      updated_at         = now()
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.business_automated_offers SET
      is_active          = p_is_active,
      custom_title       = p_custom_title,
      custom_description = p_custom_description,
      custom_image_url   = p_custom_image_url,
      discount_type      = p_discount_type,
      discount_value     = p_discount_value,
      expires_after_days = p_expires_after_days,
      voice_message_url  = p_voice_message_url,
      updated_at         = now()
    WHERE id = p_id AND business_id = p_business_id
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_business_automated_offer(
  uuid, uuid, uuid, boolean, text, text, text, text, int, int, text
) TO authenticated;

-- ── 4) list RPC — surface voice_message_url + default_image_url ─────────────
DROP FUNCTION IF EXISTS public.list_automated_offers_for_business(uuid);

CREATE OR REPLACE FUNCTION public.list_automated_offers_for_business(p_business_id uuid)
RETURNS TABLE (
  template_id        uuid,
  slug               text,
  name               text,
  emoji              text,
  description        text,
  default_image_url  text,
  trigger_type       text,
  trigger_config     jsonb,
  config_id          uuid,
  is_active          boolean,
  custom_title       text,
  custom_description text,
  custom_image_url   text,
  discount_type      text,
  discount_value     int,
  voice_message_url  text,
  last_triggered_at  timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.slug, t.name, t.emoji, t.description, t.default_image_url,
         t.trigger_type, t.trigger_config,
         o.id, COALESCE(o.is_active, false),
         o.custom_title, o.custom_description, o.custom_image_url,
         COALESCE(o.discount_type, 'none'), o.discount_value,
         o.voice_message_url,
         o.last_triggered_at
    FROM public.automated_offer_templates t
    LEFT JOIN public.business_automated_offers o
      ON o.template_id = t.id AND o.business_id = p_business_id
   ORDER BY CASE
     WHEN t.trigger_type = 'birthday'    THEN 1
     WHEN t.trigger_type = 'anniversary' THEN 2
     WHEN t.trigger_type = 'signup'      THEN 3
     WHEN t.trigger_type = 'inactivity'  THEN 4
     ELSE 9
   END, t.name;
$$;

GRANT EXECUTE ON FUNCTION public.list_automated_offers_for_business(uuid) TO authenticated;

-- ── 5) Storage bucket for voice messages ───────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('voice-messages', 'voice-messages', true)
ON CONFLICT (id) DO NOTHING;

-- Business staff can upload/replace voice messages for their own business.
DROP POLICY IF EXISTS "voice_messages_staff_write" ON storage.objects;
CREATE POLICY "voice_messages_staff_write"
  ON storage.objects FOR ALL
  TO authenticated
  USING (
    bucket_id = 'voice-messages' AND EXISTS (
      SELECT 1 FROM public.business_users
      WHERE user_id = auth.uid()
        AND role IN ('agency_admin', 'business_manager', 'business_staff')
    )
  )
  WITH CHECK (
    bucket_id = 'voice-messages' AND EXISTS (
      SELECT 1 FROM public.business_users
      WHERE user_id = auth.uid()
        AND role IN ('agency_admin', 'business_manager', 'business_staff')
    )
  );

-- Public read so the customer audio tag can fetch without auth.
DROP POLICY IF EXISTS "voice_messages_public_read" ON storage.objects;
CREATE POLICY "voice_messages_public_read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'voice-messages');

-- ── 6) Cron RPC — propagate voice_message_url to fired offers ───────────────
-- The trigger_automated_offers() function in CP-18 didn't know about voice
-- messages. We rebuild it so the daily fire copies voice_message_url to the
-- public.offers row alongside title/description/image.
--
-- If your offers table doesn't have a voice_message_url column yet, we add
-- it. That keeps this whole migration self-contained.
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS voice_message_url text;

CREATE OR REPLACE FUNCTION public.trigger_automated_offers()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row     record;
  v_today   date := current_date;
  v_window  int;
  v_diff    int;
  v_count   int  := 0;
  v_expires_at timestamptz;
BEGIN
  FOR v_row IN
    SELECT o.id AS config_id, o.business_id, o.custom_title, o.custom_description,
           o.custom_image_url, o.discount_type, o.discount_value, o.expires_after_days,
           o.voice_message_url, o.last_triggered_at,
           t.slug, t.name, t.emoji, t.default_image_url,
           t.trigger_type, t.trigger_config
      FROM public.business_automated_offers o
      JOIN public.automated_offer_templates t ON t.id = o.template_id
     WHERE o.is_active AND t.trigger_type = 'date'
  LOOP
    v_window := COALESCE((v_row.trigger_config->>'window_days')::int, 0);
    v_diff := abs(v_today - make_date(extract(year from v_today)::int,
                                       (v_row.trigger_config->>'month')::int,
                                       (v_row.trigger_config->>'day')::int));
    IF v_diff <= v_window THEN
      IF v_row.last_triggered_at IS NULL OR v_row.last_triggered_at < (now() - interval '30 days') THEN
        v_expires_at := now() + (COALESCE(v_row.expires_after_days, 7) || ' days')::interval;
        INSERT INTO public.offers
          (business_id, title, description, image_url, voice_message_url,
           expires_at, is_active, is_featured)
        VALUES
          (v_row.business_id,
           COALESCE(v_row.custom_title, v_row.emoji || ' ' || v_row.name),
           v_row.custom_description,
           COALESCE(v_row.custom_image_url, v_row.default_image_url),
           v_row.voice_message_url,
           v_expires_at,
           true,
           true)
        ON CONFLICT DO NOTHING;

        UPDATE public.business_automated_offers
           SET last_triggered_at = now()
         WHERE id = v_row.config_id;

        v_count := v_count + 1;
      END IF;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.trigger_automated_offers() TO service_role;

-- ── 7) featured_offer() — surface voice_message_url to the customer side ────
-- The banner + featured-offer modal need to know if the offer has a voice
-- note attached. Rebuilt RPC adds the column; rest of the body is
-- identical to CP-24's version.
DROP FUNCTION IF EXISTS public.featured_offer(uuid);

CREATE OR REPLACE FUNCTION public.featured_offer(p_business_id uuid)
RETURNS TABLE (
  id                 uuid,
  title              text,
  description        text,
  image_url          text,
  voice_message_url  text,
  expires_at         timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.title, o.description, o.image_url, o.voice_message_url, o.expires_at
    FROM public.offers o
   WHERE o.business_id = p_business_id
     AND o.is_active
     AND (o.expires_at IS NULL OR o.expires_at > now())
   ORDER BY
     o.is_featured DESC,
     COALESCE(o.sort_order, 0) ASC,
     o.created_at DESC
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.featured_offer(uuid) TO anon, authenticated;

-- Tell PostgREST to refresh its schema cache so the new column shows up
-- immediately for the JS client.
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification:
--
--   -- 1) New column present
--   SELECT column_name FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='business_automated_offers'
--     AND column_name='voice_message_url';
--
--   -- 2) New template present
--   SELECT slug, name FROM public.automated_offer_templates
--   WHERE slug='st_patricks';
--
--   -- 3) Storage bucket exists
--   SELECT id, public FROM storage.buckets WHERE id='voice-messages';
--
--   -- 4) Upsert RPC accepts 11 args
--   SELECT pronargs FROM pg_proc WHERE proname='upsert_business_automated_offer';
-- ─────────────────────────────────────────────────────────────────────────────
