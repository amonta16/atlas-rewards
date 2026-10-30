-- =====================================================================
-- CP-53 — saved-gift lifecycle: hide used/expired, 30-day default expiry
-- =====================================================================
-- Idempotent. Apply in the Supabase SQL editor.
--
-- my_saved_offers now:
--   • HIDES gifts the front desk already fulfilled (fulfilled_at set) —
--     a used gift should vanish from the customer's view.
--   • Uses a 30-day default expiry (from when the gift was saved) when the
--     underlying offer has no custom expiry. Custom offers keep their own
--     expires_at. Either way, expired gifts are hidden.
--
-- (Reward redemptions already expire in 30 days — see CP-05.)
-- =====================================================================

DROP FUNCTION IF EXISTS public.my_saved_offers(uuid) CASCADE;

CREATE FUNCTION public.my_saved_offers(p_business_id uuid)
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
         -- CP-53: effective expiry — custom offer expiry, else 30 days from save.
         COALESCE(o.expires_at, c.saved_at + interval '30 days') AS expires_at,
         o.voice_message_url,
         c.redeem_code, c.fulfilled_at, c.saved_at,
         o.gift_reward_id,
         r.name AS gift_reward_name
    FROM public.customer_saved_offers c
    JOIN public.offers o               ON o.id = c.offer_id
    JOIN public.business_memberships m  ON m.id = c.membership_id
    LEFT JOIN public.rewards r          ON r.id = o.gift_reward_id
   WHERE m.user_id = auth.uid()
     AND c.business_id = p_business_id
     -- CP-53: a used (delivered) gift disappears from the customer's list.
     AND c.fulfilled_at IS NULL
     -- CP-53: hide expired gifts (custom expiry, or 30-day default).
     AND COALESCE(o.expires_at, c.saved_at + interval '30 days') > now()
     -- CP-47: points-bonus gifts are auto-credited, never redeemed — hide them.
     AND COALESCE(o.discount_type, 'none') <> 'points_bonus'
   ORDER BY c.saved_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.my_saved_offers(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
