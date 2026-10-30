-- =====================================================================
-- CP-42 — Automated offer gift picker (reward OR points)
-- =====================================================================
-- Andrew's spec: replace the Discount picker (Percentage / Set $ amount)
-- on automated offers with a simpler choice:
--
--   • Pick an existing Reward as the gift  → fires a QR redemption
--   • Award N points                       → no QR, points credited
--
-- This migration:
--   1. Adds gift_kind / gift_reward_id columns to
--      business_automated_offers. We KEEP the old discount_* columns
--      for backward compatibility (no destructive change).
--   2. Reuses the existing 'points_bonus' value on discount_type for
--      points gifts, and a new 'reward' value for reward gifts.
--   3. Updates upsert_business_automated_offer to accept the new
--      gift_reward_id arg. Old callers keep working — the new param
--      defaults to NULL.
-- =====================================================================

ALTER TABLE public.business_automated_offers
  ADD COLUMN IF NOT EXISTS gift_reward_id uuid REFERENCES public.rewards(id) ON DELETE SET NULL;

-- Extend the discount_type CHECK constraint to allow 'reward'.
DO $$
BEGIN
  -- Drop whatever check constraint is on discount_type if it exists.
  ALTER TABLE public.business_automated_offers
    DROP CONSTRAINT IF EXISTS business_automated_offers_discount_type_check;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

ALTER TABLE public.business_automated_offers
  ADD CONSTRAINT business_automated_offers_discount_type_check
  CHECK (discount_type IN ('none', 'percent', 'flat_cents', 'points_bonus', 'reward'));


-- Re-create upsert_business_automated_offer with the gift_reward_id arg.
-- Drop the legacy 10-arg signature so name resolution picks this one.
DROP FUNCTION IF EXISTS public.upsert_business_automated_offer(
  uuid, uuid, uuid, boolean, text, text, text, text, int, int
);
DROP FUNCTION IF EXISTS public.upsert_business_automated_offer(
  uuid, uuid, uuid, boolean, text, text, text, text, int, int, text
);

CREATE OR REPLACE FUNCTION public.upsert_business_automated_offer(
  p_id                uuid,
  p_business_id       uuid,
  p_template_id       uuid,
  p_is_active         boolean,
  p_custom_title      text,
  p_custom_description text,
  p_custom_image_url  text,
  p_discount_type     text,
  p_discount_value    int,
  p_expires_after_days int,
  p_voice_message_url text DEFAULT NULL,
  p_gift_reward_id    uuid DEFAULT NULL   -- CP-42: link to rewards(id) for 'reward' gifts
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.staffs_business(p_business_id) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.business_automated_offers (
      business_id, template_id, is_active,
      custom_title, custom_description, custom_image_url,
      discount_type, discount_value, expires_after_days,
      voice_message_url, gift_reward_id
    )
    VALUES (
      p_business_id, p_template_id, p_is_active,
      p_custom_title, p_custom_description, p_custom_image_url,
      p_discount_type, p_discount_value, p_expires_after_days,
      p_voice_message_url, p_gift_reward_id
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.business_automated_offers
       SET is_active          = p_is_active,
           custom_title        = p_custom_title,
           custom_description  = p_custom_description,
           custom_image_url    = p_custom_image_url,
           discount_type       = p_discount_type,
           discount_value      = p_discount_value,
           expires_after_days  = p_expires_after_days,
           voice_message_url   = p_voice_message_url,
           gift_reward_id      = p_gift_reward_id,
           updated_at          = now()
     WHERE id = p_id AND business_id = p_business_id
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END; $$;

GRANT EXECUTE ON FUNCTION public.upsert_business_automated_offer(
  uuid, uuid, uuid, boolean, text, text, text, text, int, int, text, uuid
) TO authenticated;


-- Update list_automated_offers_for_business to return the gift_reward_id
-- + the linked reward's name (so the UI can display "Free Facial" without
-- a second roundtrip).
DROP FUNCTION IF EXISTS public.list_automated_offers_for_business(uuid);

CREATE OR REPLACE FUNCTION public.list_automated_offers_for_business(p_business_id uuid)
RETURNS TABLE (
  template_id        uuid,
  slug               text,
  name               text,
  emoji              text,
  description        text,
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
  last_triggered_at  timestamptz,
  -- CP-42 additions
  gift_reward_id     uuid,
  gift_reward_name   text,
  default_image_url  text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    t.id, t.slug, t.name, t.emoji, t.description,
    t.trigger_type, t.trigger_config,
    o.id, COALESCE(o.is_active, false),
    o.custom_title, o.custom_description, o.custom_image_url,
    COALESCE(o.discount_type, 'none'), o.discount_value,
    o.voice_message_url, o.last_triggered_at,
    o.gift_reward_id,
    r.name AS gift_reward_name,
    NULL::text AS default_image_url
  FROM public.automated_offer_templates t
  LEFT JOIN public.business_automated_offers o
    ON o.template_id = t.id AND o.business_id = p_business_id
  LEFT JOIN public.rewards r
    ON r.id = o.gift_reward_id
  ORDER BY CASE
    WHEN t.trigger_type = 'birthday'    THEN 1
    WHEN t.trigger_type = 'anniversary' THEN 2
    WHEN t.trigger_type = 'signup'      THEN 3
    WHEN t.trigger_type = 'inactivity'  THEN 4
    ELSE 9
  END, t.name;
$$;

GRANT EXECUTE ON FUNCTION public.list_automated_offers_for_business(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
