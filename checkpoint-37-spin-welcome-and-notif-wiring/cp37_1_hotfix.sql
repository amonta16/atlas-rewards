-- =====================================================================
-- CP-37.1 hotfix — gen_random_bytes + streak reward images
-- =====================================================================
-- Run AFTER cp37_migration.sql (or instead of it on a fresh DB — this
-- file is also idempotent).
--
-- Fixes:
--   1) "function gen_random_bytes(integer) does not exist" when a
--      customer taps "Claim this gift" on a limited offer.
--      Root cause: pgcrypto lives in the `extensions` schema by
--      default on Supabase, but save_offer / my_saved_offers / etc
--      run with SET search_path = public, which hides extensions.
--      Two-step fix:
--        (a) CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public
--            so gen_random_bytes is resolvable from public.
--        (b) Re-create save_offer with a fully-qualified call as a
--            belt-and-suspenders, plus a md5(random()) fallback if
--            pgcrypto still isn't available (matches CP-25 pattern).
--
--   2) Streak milestone cells should show the linked reward's IMAGE,
--      not just a Gift icon. Andrew: "display the content of pre-
--      existing rewards, so people know what they are working up too."
--      Fix: enrich the milestones jsonb returned from get_streak_status
--      with reward_image_url + reward_name when milestone.reward_id is
--      set. The client renders the image inline on the cell.
-- =====================================================================


-- ---------------------------------------------------------------------
-- (1a) Make pgcrypto resolvable from public
-- ---------------------------------------------------------------------
-- WITH SCHEMA public so gen_random_bytes() / gen_random_uuid() / crypt()
-- can be called from functions that pin search_path to public. Safe to
-- re-run; if the extension was already installed in another schema,
-- Postgres will leave it alone.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


-- ---------------------------------------------------------------------
-- (1b) save_offer w/ pgcrypto fallback
-- ---------------------------------------------------------------------
-- Same return + error contract as before, but the code minting loop
-- now degrades gracefully if gen_random_bytes still isn't on the
-- search path. Falls back to md5(random()) — slightly weaker entropy
-- but plenty for 7-char gift codes inside a single business namespace.
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
    -- Try pgcrypto first; fall through to md5(random()) on any error.
    BEGIN
      v_code := upper(substring(
        translate(encode(public.gen_random_bytes(10), 'base64'), '+/=OoIl01', '')
        from 1 for 7
      ));
    EXCEPTION WHEN OTHERS THEN
      v_code := upper(substring(
        translate(md5(random()::text || clock_timestamp()::text), 'oOiIlL01', '')
        from 1 for 7
      ));
    END;

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
-- (2) get_streak_status returns milestones enriched with reward image
-- ---------------------------------------------------------------------
-- The streak_config.milestones jsonb can include { reward_id: uuid }
-- per milestone (CP-42 added this — agencies pick "Reward" instead of
-- "Points" per milestone). When set, look up the reward and inject
-- reward_image_url + reward_name into the milestone JSON so the
-- StreakWidget on the customer Rewards tab can render the actual
-- reward's photo inside the cell.
--
-- Existing behavior preserved when reward_id is null — milestone JSON
-- gets a null reward_image_url + null reward_name, and the client
-- falls back to the generic Gift icon.

CREATE OR REPLACE FUNCTION public.get_streak_status(
  p_business_id   uuid,
  p_membership_id uuid
)
RETURNS TABLE (
  is_enabled         boolean,
  period_type        text,
  checkins_required_per_period int,
  current_streak     int,
  longest_streak     int,
  total_checkins     int,
  last_checkin_at    timestamptz,
  checked_in_this_period boolean,
  milestones         jsonb,
  claimed_milestones int[]
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cfg   record;
  v_state record;
  v_period_start timestamptz;
  v_enriched jsonb;
BEGIN
  SELECT * INTO v_cfg FROM public.streak_config WHERE business_id = p_business_id;
  IF v_cfg IS NULL OR NOT v_cfg.is_enabled THEN
    is_enabled := false;
    RETURN NEXT; RETURN;
  END IF;

  v_period_start := public.streak_period_start(now(), v_cfg.period_type);

  SELECT * INTO v_state FROM public.member_streaks
   WHERE business_id = p_business_id AND membership_id = p_membership_id;

  -- CP-37.1: enrich milestones with the linked reward's image + name.
  -- LEFT JOIN so milestones without a reward_id pass through cleanly
  -- with null fields (client falls back to the Gift icon for those).
  WITH src AS (
    SELECT m.elem
      FROM jsonb_array_elements(COALESCE(v_cfg.milestones, '[]'::jsonb)) WITH ORDINALITY AS m(elem, ord)
       ORDER BY m.ord
  )
  SELECT COALESCE(jsonb_agg(
           src.elem
             || jsonb_build_object(
                  'reward_image_url', r.image_url,
                  'reward_name',      r.name
                )
         ), '[]'::jsonb)
    INTO v_enriched
    FROM src
    LEFT JOIN public.rewards r
      ON r.id = NULLIF(src.elem->>'reward_id', '')::uuid;

  is_enabled                  := true;
  period_type                 := v_cfg.period_type;
  checkins_required_per_period:= v_cfg.checkins_required_per_period;
  current_streak              := COALESCE(v_state.current_streak, 0);
  longest_streak              := COALESCE(v_state.longest_streak, 0);
  total_checkins              := COALESCE(v_state.total_checkins, 0);
  last_checkin_at             := v_state.last_checkin_at;
  checked_in_this_period      := v_state.period_started_at = v_period_start
                                  AND v_state.current_period_checkins >= v_cfg.checkins_required_per_period;
  milestones                  := v_enriched;
  claimed_milestones          := COALESCE(v_state.claimed_milestones, '{}'::int[]);
  RETURN NEXT;
END; $$;

GRANT EXECUTE ON FUNCTION public.get_streak_status(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
