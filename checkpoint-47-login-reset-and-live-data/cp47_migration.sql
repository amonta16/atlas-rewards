-- =====================================================================
-- CP-47 — points gifts out of saved-gifts · (see README for demo cleanup)
-- =====================================================================
-- Idempotent. Apply the whole file in the Supabase SQL editor.
--
-- my_saved_offers: a points-bonus welcome ("Award Points") is credited
-- instantly and has no redeemable code — it should NOT appear in the
-- customer's Saved gifts list (which is for discounts / reward gifts the
-- front desk fulfills with a code). The CP-46 reveal still fires once via
-- my_unrevealed_welcome_gift; we just keep the points gift out of the
-- persistent saved-gifts list so it never shows "Code not generated yet".
-- =====================================================================

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
     -- CP-47: points-bonus gifts are auto-credited, never redeemed — hide them.
     AND COALESCE(o.discount_type, 'none') <> 'points_bonus'
   ORDER BY c.fulfilled_at NULLS FIRST, c.saved_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.my_saved_offers(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
