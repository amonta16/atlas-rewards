-- ─────────────────────────────────────────────────────────────────────────────
-- CP-29.1 — Offer popup reveal + discount propagation
-- ─────────────────────────────────────────────────────────────────────────────
-- Run AFTER cp29_migration.sql. Self-contained, idempotent.
--
-- What this adds:
--   1) `discount_type` + `discount_value` columns on `public.offers`. The
--      automated-offer template has discount fields, but the cron that
--      fires the offer was dropping them on the floor. With these columns
--      the customer-side reveal popup can show "10% off" / "$5 off" /
--      "+200 pts" chips.
--
--   2) `trigger_automated_offers()` rebuilt to propagate the discount
--      fields from `business_automated_offers` onto the fired
--      `public.offers` row.
--
--   3) `featured_offer()` returns the discount fields so both the popup
--      and the rewards-page "Limited offers" section can render them
--      without an extra fetch.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1) Add discount columns to public.offers ────────────────────────────────
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS discount_type  text,
  ADD COLUMN IF NOT EXISTS discount_value int;

-- ── 2) trigger_automated_offers — propagate discount + image fallback ─────
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
           discount_type, discount_value,
           expires_at, is_active, is_featured, is_automated)
        VALUES
          (v_row.business_id,
           COALESCE(v_row.custom_title, v_row.emoji || ' ' || v_row.name),
           v_row.custom_description,
           COALESCE(v_row.custom_image_url, v_row.default_image_url),
           v_row.voice_message_url,
           v_row.discount_type,
           v_row.discount_value,
           v_expires_at,
           true,
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

-- ── 3) featured_offer — surface discount fields to customer client ────────
DROP FUNCTION IF EXISTS public.featured_offer(uuid);

CREATE OR REPLACE FUNCTION public.featured_offer(p_business_id uuid)
RETURNS TABLE (
  id                 uuid,
  title              text,
  description        text,
  image_url          text,
  voice_message_url  text,
  discount_type      text,
  discount_value     int,
  expires_at         timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.title, o.description, o.image_url, o.voice_message_url,
         o.discount_type, o.discount_value, o.expires_at
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

-- ── 4) list_active_offers — full list with discount/voice for the rewards
--      page "Limited offers" section. NEW RPC.
DROP FUNCTION IF EXISTS public.list_active_offers(uuid);

CREATE OR REPLACE FUNCTION public.list_active_offers(p_business_id uuid)
RETURNS TABLE (
  id                 uuid,
  title              text,
  description        text,
  image_url          text,
  voice_message_url  text,
  discount_type      text,
  discount_value     int,
  expires_at         timestamptz,
  is_automated       boolean,
  is_featured        boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.title, o.description, o.image_url, o.voice_message_url,
         o.discount_type, o.discount_value, o.expires_at,
         COALESCE(o.is_automated, false),
         COALESCE(o.is_featured,  false)
    FROM public.offers o
   WHERE o.business_id = p_business_id
     AND o.is_active
     AND (o.expires_at IS NULL OR o.expires_at > now())
   ORDER BY o.is_featured DESC,
            COALESCE(o.expires_at, 'infinity'::timestamptz) ASC,
            o.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.list_active_offers(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='offers'
--     AND column_name IN ('discount_type','discount_value');
--
--   SELECT proargnames FROM pg_proc WHERE proname='featured_offer';
--   SELECT proname FROM pg_proc WHERE proname='list_active_offers';
-- ─────────────────────────────────────────────────────────────────────────────
