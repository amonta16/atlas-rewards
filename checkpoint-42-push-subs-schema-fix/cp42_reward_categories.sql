-- =====================================================================
-- CP-42 — Reward categories
-- =====================================================================
-- Adds a free-form `category` text column on the rewards table so the
-- customer-side Shop page can group rewards (Food, Drinks, Exclusive,
-- Birthday, etc.) the way McDonald's and Starbucks do it.
--
-- We deliberately use a free-form text column instead of a separate
-- categories table — businesses can name categories anything they
-- want, and the customer shop just groups by distinct value. Less
-- schema friction, no per-business category management UI required.
-- The admin form will surface the existing category strings as
-- autocomplete suggestions.
-- =====================================================================

ALTER TABLE public.rewards
  ADD COLUMN IF NOT EXISTS category text;

-- Index for fast group-by on the shop page
CREATE INDEX IF NOT EXISTS rewards_business_category
  ON public.rewards (business_id, category, sort_order)
  WHERE is_active = true;

-- Drop the legacy 9-arg overload so the new 10-arg one resolves cleanly.
DROP FUNCTION IF EXISTS public.upsert_reward(uuid, uuid, text, text, text, int, text, boolean, int);

CREATE OR REPLACE FUNCTION public.upsert_reward(
  p_id           uuid,
  p_business_id  uuid,
  p_name         text,
  p_description  text default null,
  p_reward_type  text default 'discount',
  p_point_cost   int  default 500,
  p_image_url    text default null,
  p_is_active    boolean default true,
  p_sort_order   int default 0,
  p_category     text default null   -- CP-42: optional shop-grouping label
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.staffs_business(p_business_id) THEN RAISE EXCEPTION 'permission denied'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.rewards
      (business_id, name, description, reward_type, point_cost,
       image_url, is_active, sort_order, category)
    VALUES
      (p_business_id, p_name, p_description, p_reward_type, p_point_cost,
       p_image_url, p_is_active, p_sort_order, p_category)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.rewards
       SET name        = p_name,
           description = p_description,
           reward_type = p_reward_type,
           point_cost  = p_point_cost,
           image_url   = p_image_url,
           is_active   = p_is_active,
           sort_order  = p_sort_order,
           category    = p_category,
           updated_at  = now()
     WHERE id = p_id AND business_id = p_business_id
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END; $$;

GRANT EXECUTE ON FUNCTION public.upsert_reward(uuid, uuid, text, text, text, int, text, boolean, int, text) TO authenticated;

-- Helper RPC: returns the distinct categories this business is already
-- using, sorted by frequency. Powers the autocomplete in the admin
-- rewards form so categories stay consistent.
CREATE OR REPLACE FUNCTION public.business_reward_categories(p_business_id uuid)
RETURNS TABLE (category text, n int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT category, count(*)::int
    FROM public.rewards
   WHERE business_id = p_business_id
     AND category IS NOT NULL
     AND length(trim(category)) > 0
   GROUP BY category
   ORDER BY count(*) DESC, category;
$$;

GRANT EXECUTE ON FUNCTION public.business_reward_categories(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
