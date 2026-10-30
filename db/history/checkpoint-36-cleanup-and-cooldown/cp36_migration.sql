-- =====================================================================
-- CP-36 — invite policy tightening, save-offer flow, 12h check-in cooldown
-- =====================================================================
-- Run this AFTER cp32/34/35 migrations. Idempotent — re-running is safe.
--
-- Sections:
--   1) Updated create_invitation: managers can now invite managers too
--      (per Andrew's "side managers" request). Front desk still can't
--      invite anyone — the permission check just never falls through.
--   2) customer_saved_offers + save_offer + my_saved_offers — backs the
--      "Save to my rewards" tap on the OfferRevealPopup so the gift
--      actually shows up in the customer's Rewards tab.
--   3) member_checkin gets a 12-HOUR cooldown (was: one-per-period).
--      A second check-in within the same calendar day still won't
--      advance the streak, but it now requires 12h to have elapsed
--      since the previous scan. Plus member_checkin_status() so the
--      customer header pill can render a "6 Hr" countdown.
-- =====================================================================

-- ----- 1. Updated create_invitation: manager → manager allowed -------
DROP FUNCTION IF EXISTS public.create_invitation(text, text, uuid);

CREATE OR REPLACE FUNCTION public.create_invitation(
  p_email       text,
  p_role        text,
  p_business_id uuid DEFAULT NULL
)
RETURNS TABLE (
  invitation_id uuid,
  token         uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(btrim(p_email));
  v_id    uuid;
  v_tok   uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF v_email IS NULL OR v_email = '' OR position('@' in v_email) = 0 THEN
    RAISE EXCEPTION 'invalid email';
  END IF;
  IF p_role NOT IN ('agency_admin','business_manager','business_staff') THEN
    RAISE EXCEPTION 'invalid role';
  END IF;

  -- Permission check
  IF p_role = 'agency_admin' THEN
    -- Only agency_admins can mint other agency_admins.
    IF NOT public.is_agency_admin() THEN
      RAISE EXCEPTION 'only agency_admin can invite agency_admin';
    END IF;
    IF p_business_id IS NOT NULL THEN
      RAISE EXCEPTION 'agency_admin invites must have business_id = NULL';
    END IF;
  ELSE
    -- business_manager + business_staff invites are scoped to one business.
    IF p_business_id IS NULL THEN
      RAISE EXCEPTION 'business_id required for role %', p_role;
    END IF;
    -- CP-36: managers can now invite BOTH co-managers and front-desk staff
    -- for their own business. Front-desk (business_staff) still falls
    -- through the OR chain → permission denied.
    IF NOT (
      public.is_agency_admin()
      OR (p_role IN ('business_manager','business_staff')
          AND public.is_business_manager(p_business_id))
    ) THEN
      RAISE EXCEPTION 'permission denied for invite of role % to business %', p_role, p_business_id;
    END IF;
  END IF;

  INSERT INTO public.pending_invitations
    (email, business_id, role, invited_by)
  VALUES
    (v_email, p_business_id, p_role, auth.uid())
  RETURNING id, token INTO v_id, v_tok;

  RETURN QUERY SELECT v_id, v_tok;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_invitation(text, text, uuid) TO authenticated;


-- ----- 2. customer_saved_offers + save_offer + my_saved_offers -------
-- Records when a customer explicitly taps "Save to my rewards" on an
-- automated-offer gift popup. The Rewards tab uses this table to render
-- a "Your saved gifts" section so the action feels real (previously the
-- button just dismissed the popup).

CREATE TABLE IF NOT EXISTS public.customer_saved_offers (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  membership_id uuid NOT NULL REFERENCES public.business_memberships(id) ON DELETE CASCADE,
  offer_id      uuid NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  business_id   uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  -- CP-36b: short alphanumeric code so the customer can show this gift to
  -- the front desk and have them scan/type it to fulfill. Same shape as
  -- redemptions.code (7 chars) so the existing scanner pipeline can pick
  -- it up. Per-business unique (see partial index below).
  redeem_code   text,
  fulfilled_at  timestamptz,
  fulfilled_by  uuid REFERENCES auth.users(id),
  saved_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (membership_id, offer_id)
);

-- Add the new columns if the table already existed from a prior cp36 run.
ALTER TABLE public.customer_saved_offers ADD COLUMN IF NOT EXISTS redeem_code  text;
ALTER TABLE public.customer_saved_offers ADD COLUMN IF NOT EXISTS fulfilled_at timestamptz;
ALTER TABLE public.customer_saved_offers ADD COLUMN IF NOT EXISTS fulfilled_by uuid REFERENCES auth.users(id);

CREATE UNIQUE INDEX IF NOT EXISTS customer_saved_offers_biz_code_idx
  ON public.customer_saved_offers (business_id, redeem_code)
  WHERE redeem_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS customer_saved_offers_member_idx
  ON public.customer_saved_offers (membership_id, saved_at DESC);
CREATE INDEX IF NOT EXISTS customer_saved_offers_biz_idx
  ON public.customer_saved_offers (business_id, saved_at DESC);

ALTER TABLE public.customer_saved_offers ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  BEGIN DROP POLICY "saved_offers_self" ON public.customer_saved_offers; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN DROP POLICY "saved_offers_staff" ON public.customer_saved_offers; EXCEPTION WHEN undefined_object THEN NULL; END;
END $$;

CREATE POLICY "saved_offers_self" ON public.customer_saved_offers
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.business_memberships m WHERE m.id = membership_id AND m.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.business_memberships m WHERE m.id = membership_id AND m.user_id = auth.uid()));

CREATE POLICY "saved_offers_staff" ON public.customer_saved_offers
  FOR SELECT TO authenticated
  USING (public.staffs_business(business_id));


CREATE OR REPLACE FUNCTION public.save_offer(p_offer_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business_id  uuid;
  v_membership_id uuid;
  v_saved_id     uuid;
  v_code         text;
  v_try          int := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT business_id INTO v_business_id FROM public.offers WHERE id = p_offer_id;
  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'offer not found';
  END IF;

  SELECT id INTO v_membership_id
    FROM public.business_memberships
   WHERE user_id = auth.uid()
     AND business_id = v_business_id
   LIMIT 1;
  IF v_membership_id IS NULL THEN
    RAISE EXCEPTION 'no membership for this business — join first';
  END IF;

  -- CP-36b: mint a 7-char code (matches redemptions.code shape) so the
  -- front desk's existing 7-char redemption resolver picks the gift up.
  -- Loop on the unlikely collision; in practice the alphabet is 30^7 ≈ 22B.
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
    IF v_try > 10 THEN RAISE EXCEPTION 'could not mint unique code'; END IF;
  END LOOP;

  -- Idempotent: re-tapping save returns the existing row's id; we do NOT
  -- regenerate the code if one already exists.
  INSERT INTO public.customer_saved_offers
    (membership_id, offer_id, business_id, redeem_code)
  VALUES (v_membership_id, p_offer_id, v_business_id, v_code)
  ON CONFLICT (membership_id, offer_id) DO UPDATE
    SET saved_at    = customer_saved_offers.saved_at,
        redeem_code = COALESCE(customer_saved_offers.redeem_code, EXCLUDED.redeem_code)
  RETURNING id INTO v_saved_id;

  RETURN v_saved_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.save_offer(uuid) TO authenticated;


-- ----- Fulfill a saved-gift code at the front desk ---------------------
-- Resolves a 7-char code → marks the gift fulfilled. Mirrors the existing
-- resolve_redemption_by_code / fulfill_redemption pair. Permission gate:
-- caller must staff the business.

-- Defensive DROP in case a previous partial cp36 run created an earlier
-- shape of this function — return-type-changing CREATE OR REPLACE errors
-- unless the old signature is gone first.
DROP FUNCTION IF EXISTS public.resolve_saved_offer_by_code(text, uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.resolve_saved_offer_by_code(
  p_code text,
  p_business_id uuid
)
RETURNS TABLE (
  saved_id      uuid,
  membership_id uuid,
  full_name     text,
  email         text,
  offer_id      uuid,
  title         text,
  description   text,
  image_url     text,
  discount_type text,
  discount_value int,
  expires_at    timestamptz,
  fulfilled_at  timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.membership_id, p.full_name, p.email,
         o.id, o.title, o.description, o.image_url,
         o.discount_type::text, o.discount_value, o.expires_at,
         c.fulfilled_at
    FROM public.customer_saved_offers c
    JOIN public.offers o               ON o.id = c.offer_id
    JOIN public.business_memberships m ON m.id = c.membership_id
    LEFT JOIN public.profiles p        ON p.id = m.user_id
   WHERE c.business_id = p_business_id
     AND c.redeem_code = upper(btrim(p_code))
     AND public.staffs_business(p_business_id);
$$;
GRANT EXECUTE ON FUNCTION public.resolve_saved_offer_by_code(text, uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.fulfill_saved_offer(p_saved_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_biz uuid;
BEGIN
  SELECT business_id INTO v_biz FROM public.customer_saved_offers WHERE id = p_saved_id;
  IF v_biz IS NULL THEN RAISE EXCEPTION 'gift not found'; END IF;
  IF NOT public.staffs_business(v_biz) THEN RAISE EXCEPTION 'permission denied'; END IF;
  UPDATE public.customer_saved_offers
     SET fulfilled_at = now(), fulfilled_by = auth.uid()
   WHERE id = p_saved_id AND fulfilled_at IS NULL;
  RETURN p_saved_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.fulfill_saved_offer(uuid) TO authenticated;


-- CP-36b: return shape changed (added saved_id, redeem_code, fulfilled_at)
-- so the old signature must be dropped before re-creating. CASCADE in
-- case anything was wired up to the previous shape — there shouldn't be,
-- but it's cheap insurance against a stuck migration.
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
  saved_at          timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, o.id, o.title, o.description, o.image_url,
         o.discount_type::text, o.discount_value, o.expires_at, o.voice_message_url,
         c.redeem_code, c.fulfilled_at, c.saved_at
    FROM public.customer_saved_offers c
    JOIN public.offers o              ON o.id = c.offer_id
    JOIN public.business_memberships m ON m.id = c.membership_id
   WHERE m.user_id = auth.uid()
     AND c.business_id = p_business_id
     AND (o.expires_at IS NULL OR o.expires_at > now())
   ORDER BY c.fulfilled_at NULLS FIRST, c.saved_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.my_saved_offers(uuid) TO authenticated;


-- ----- 3. 12-hour check-in cooldown + status RPC ----------------------
-- Previously member_checkin used a "one check-in per period" idempotency
-- key (e.g. once per calendar day). Andrew asked for a hard 12h cooldown
-- so the same member can be scanned twice in a single day if they came
-- in for both an AM and PM visit, while still only advancing the streak
-- once per period.

DROP FUNCTION IF EXISTS public.member_checkin_status(uuid, uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.member_checkin_status(
  p_business_id   uuid,
  p_membership_id uuid
)
RETURNS TABLE (
  can_check_in_now     boolean,
  last_checkin_at      timestamptz,
  next_check_in_at     timestamptz,
  seconds_until_next   int,
  checked_in_today     boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH s AS (
    SELECT last_checkin_at
      FROM public.member_streaks
     WHERE business_id = p_business_id AND membership_id = p_membership_id
  ),
  today AS (
    SELECT EXISTS (
      SELECT 1 FROM public.check_in_events
       WHERE membership_id = p_membership_id
         AND business_id   = p_business_id
         AND created_at   >= date_trunc('day', now() at time zone 'UTC')
    ) AS yes
  )
  SELECT
    -- ready when either never checked in, or 12h has fully elapsed
    COALESCE(s.last_checkin_at IS NULL OR s.last_checkin_at + interval '12 hours' <= now(), true) AS can_check_in_now,
    s.last_checkin_at,
    CASE WHEN s.last_checkin_at IS NULL THEN now()
         ELSE s.last_checkin_at + interval '12 hours' END AS next_check_in_at,
    GREATEST(
      0,
      CASE WHEN s.last_checkin_at IS NULL THEN 0
           ELSE EXTRACT(EPOCH FROM (s.last_checkin_at + interval '12 hours') - now())::int END
    ) AS seconds_until_next,
    today.yes AS checked_in_today
  FROM today
  LEFT JOIN s ON true;
$$;
GRANT EXECUTE ON FUNCTION public.member_checkin_status(uuid, uuid) TO authenticated;


-- Replace member_checkin so the idempotency uses a 12h cooldown rather
-- than the strict per-period gate.
DROP FUNCTION IF EXISTS public.member_checkin(uuid, uuid);

CREATE OR REPLACE FUNCTION public.member_checkin(
  p_business_id   uuid,
  p_membership_id uuid
)
RETURNS TABLE (
  streak_after        int,
  longest_after       int,
  awarded_points      int,
  is_milestone        boolean,
  milestone_label     text,
  milestone_mystery_unlocked boolean,
  already_checked_in  boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cfg               record;
  v_state             record;
  v_now               timestamptz := now();
  v_period_start      timestamptz;
  v_prev_period_start timestamptz;
  v_new_streak        int;
  v_new_longest       int;
  v_milestones        jsonb;
  v_milestone_node    jsonb;
  v_milestone_points  int := 0;
  v_milestone_label   text := null;
  v_milestone_mystery boolean := false;
  v_is_milestone      boolean := false;
BEGIN
  IF NOT public.staffs_business(p_business_id) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  SELECT * INTO v_cfg FROM public.streak_config WHERE business_id = p_business_id;
  IF v_cfg IS NULL OR NOT v_cfg.is_enabled THEN
    RAISE EXCEPTION 'check-in is not enabled for this business';
  END IF;

  v_period_start := public.streak_period_start(v_now, v_cfg.period_type);

  -- Lock the state row (or create it).
  INSERT INTO public.member_streaks (business_id, membership_id)
  VALUES (p_business_id, p_membership_id)
  ON CONFLICT (business_id, membership_id) DO NOTHING;

  SELECT * INTO v_state
    FROM public.member_streaks
   WHERE business_id = p_business_id AND membership_id = p_membership_id
   FOR UPDATE;

  -- CP-36: hard 12-hour cooldown. If they were scanned less than 12h ago,
  -- reject. The streak doesn't advance, no audit row is written.
  IF v_state.last_checkin_at IS NOT NULL
     AND v_state.last_checkin_at + interval '12 hours' > v_now
  THEN
    streak_after       := v_state.current_streak;
    longest_after      := v_state.longest_streak;
    awarded_points     := 0;
    is_milestone       := false;
    milestone_label    := null;
    milestone_mystery_unlocked := false;
    already_checked_in := true;
    RETURN NEXT; RETURN;
  END IF;

  -- Compute the previous period start for streak continuity.
  v_prev_period_start := CASE v_cfg.period_type
    WHEN 'daily'   THEN v_period_start - interval '1 day'
    WHEN 'weekly'  THEN v_period_start - interval '1 week'
    WHEN 'monthly' THEN v_period_start - interval '1 month'
  END;

  IF v_state.current_period_checkins = 0
     OR v_state.period_started_at IS NULL
     OR v_state.period_started_at <> v_period_start
  THEN
    IF v_state.period_started_at IS NULL THEN
      v_new_streak := 1;
    ELSIF v_state.period_started_at = v_prev_period_start
          AND v_state.current_period_checkins >= v_cfg.checkins_required_per_period THEN
      v_new_streak := v_state.current_streak + 1;
    ELSE
      v_new_streak := 1;
      UPDATE public.member_streaks SET claimed_milestones = '{}'::int[] WHERE id = v_state.id;
      v_state.claimed_milestones := '{}'::int[];
    END IF;
    v_state.current_period_checkins := 0;
  ELSE
    v_new_streak := v_state.current_streak;
  END IF;

  v_state.current_period_checkins := v_state.current_period_checkins + 1;

  IF v_state.current_period_checkins < v_cfg.checkins_required_per_period THEN
    IF v_state.current_streak = 0 THEN
      v_new_streak := 0;
    ELSE
      v_new_streak := v_state.current_streak;
    END IF;
  END IF;

  v_new_longest := GREATEST(v_state.longest_streak, v_new_streak);

  -- Milestone resolution (period-completing check-ins only).
  IF v_state.current_period_checkins >= v_cfg.checkins_required_per_period THEN
    v_milestones := COALESCE(v_cfg.milestones, '[]'::jsonb);
    FOR v_milestone_node IN SELECT value FROM jsonb_array_elements(v_milestones)
    LOOP
      IF (v_milestone_node->>'count')::int = v_new_streak
         AND NOT (v_new_streak = ANY(COALESCE(v_state.claimed_milestones, '{}'::int[])))
      THEN
        v_milestone_points  := COALESCE((v_milestone_node->>'points')::int, 0);
        v_milestone_label   := v_milestone_node->>'label';
        v_milestone_mystery := COALESCE((v_milestone_node->>'mystery')::boolean, false);
        v_is_milestone      := true;
        EXIT;
      END IF;
    END LOOP;
  END IF;

  UPDATE public.member_streaks SET
    current_streak          = v_new_streak,
    longest_streak          = v_new_longest,
    total_checkins          = total_checkins + 1,
    last_checkin_at         = v_now,
    current_period_checkins = v_state.current_period_checkins,
    period_started_at       = v_period_start,
    claimed_milestones      = CASE WHEN v_is_milestone
                                   THEN array_append(COALESCE(claimed_milestones, '{}'::int[]), v_new_streak)
                                   ELSE claimed_milestones END
   WHERE id = v_state.id;

  IF v_milestone_points > 0 THEN
    INSERT INTO public.points_ledger
      (business_id, membership_id, delta, rule_type, notes)
    VALUES
      (p_business_id, p_membership_id, v_milestone_points, 'streak_milestone',
       'Streak milestone: ' || COALESCE(v_milestone_label, v_new_streak::text));

    UPDATE public.business_memberships
       SET points_balance = points_balance + v_milestone_points,
           lifetime_points_earned = lifetime_points_earned + v_milestone_points
     WHERE id = p_membership_id;
  END IF;

  INSERT INTO public.check_in_events
    (business_id, membership_id, streak_after, awarded_points,
     is_milestone, milestone_label, milestone_mystery_unlocked,
     checked_in_by_user_id)
  VALUES
    (p_business_id, p_membership_id, v_new_streak, v_milestone_points,
     v_is_milestone, v_milestone_label, v_milestone_mystery,
     auth.uid());

  IF v_milestone_mystery THEN
    INSERT INTO public.customer_messages
      (business_id, membership_id, kind, title, body, expires_at)
    VALUES
      (p_business_id, p_membership_id, 'milestone',
       '🎉 Mystery unlocked!',
       'You hit the ' || COALESCE(v_milestone_label, v_new_streak::text) || ' milestone. Tap to spin.',
       now() + interval '14 days');
  END IF;

  streak_after       := v_new_streak;
  longest_after      := v_new_longest;
  awarded_points     := v_milestone_points;
  is_milestone       := v_is_milestone;
  milestone_label    := v_milestone_label;
  milestone_mystery_unlocked := v_milestone_mystery;
  already_checked_in := false;
  RETURN NEXT;
END;
$$;
GRANT EXECUTE ON FUNCTION public.member_checkin(uuid, uuid) TO authenticated;


-- =====================================================================
-- 4) Notification settings — per business + per customer toggles
-- =====================================================================
-- CP-36b: complete notification surface revamp. The Notifications tab
-- moved off the manager view; the agency admin now owns "which
-- notification types fire" per-business, and the customer owns "which
-- of those they actually want to receive" per-membership. Both layers
-- are honored when broadcast_notification or any auto-trigger fires.
--
-- Default everything to ON so existing behavior is preserved.

CREATE TABLE IF NOT EXISTS public.business_notification_settings (
  business_id                      uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  -- Type-by-type kill switches owned by the agency.
  streak_reminders                 boolean NOT NULL DEFAULT true,
  gift_expiration_reminders        boolean NOT NULL DEFAULT true,
  customer_offer_announcements     boolean NOT NULL DEFAULT true,
  check_in_available               boolean NOT NULL DEFAULT true,
  we_miss_you                      boolean NOT NULL DEFAULT true,
  reward_unlocked                  boolean NOT NULL DEFAULT true,
  birthday                         boolean NOT NULL DEFAULT true,
  review_request                   boolean NOT NULL DEFAULT true,
  updated_at                       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.business_notification_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  BEGIN DROP POLICY "bns_staff_read"  ON public.business_notification_settings; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN DROP POLICY "bns_admin_write" ON public.business_notification_settings; EXCEPTION WHEN undefined_object THEN NULL; END;
END $$;

-- Anyone enrolled (member or staff) can READ — customer needs to know
-- what's enabled so the profile screen reflects truth.
CREATE POLICY "bns_staff_read" ON public.business_notification_settings
  FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "bns_admin_write" ON public.business_notification_settings
  FOR ALL TO authenticated
  USING (public.is_business_manager(business_id) OR public.is_agency_admin())
  WITH CHECK (public.is_business_manager(business_id) OR public.is_agency_admin());


CREATE OR REPLACE FUNCTION public.get_business_notification_settings(p_business_id uuid)
RETURNS public.business_notification_settings
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.business_notification_settings;
BEGIN
  SELECT * INTO r FROM public.business_notification_settings WHERE business_id = p_business_id;
  IF NOT FOUND THEN
    -- Synthesize a defaults row (all-on) without inserting — saves a write
    -- on read for businesses that have never touched the toggles.
    r.business_id := p_business_id;
    r.streak_reminders := true;
    r.gift_expiration_reminders := true;
    r.customer_offer_announcements := true;
    r.check_in_available := true;
    r.we_miss_you := true;
    r.reward_unlocked := true;
    r.birthday := true;
    r.review_request := true;
    r.updated_at := now();
  END IF;
  RETURN r;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_business_notification_settings(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.update_business_notification_settings(
  p_business_id uuid,
  p_streak_reminders            boolean,
  p_gift_expiration_reminders   boolean,
  p_customer_offer_announcements boolean,
  p_check_in_available          boolean,
  p_we_miss_you                 boolean,
  p_reward_unlocked             boolean,
  p_birthday                    boolean,
  p_review_request              boolean
)
RETURNS public.business_notification_settings
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.business_notification_settings;
BEGIN
  IF NOT (public.is_business_manager(p_business_id) OR public.is_agency_admin()) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;
  INSERT INTO public.business_notification_settings AS b
    (business_id, streak_reminders, gift_expiration_reminders,
     customer_offer_announcements, check_in_available, we_miss_you,
     reward_unlocked, birthday, review_request, updated_at)
  VALUES
    (p_business_id, p_streak_reminders, p_gift_expiration_reminders,
     p_customer_offer_announcements, p_check_in_available, p_we_miss_you,
     p_reward_unlocked, p_birthday, p_review_request, now())
  ON CONFLICT (business_id) DO UPDATE SET
    streak_reminders             = EXCLUDED.streak_reminders,
    gift_expiration_reminders    = EXCLUDED.gift_expiration_reminders,
    customer_offer_announcements = EXCLUDED.customer_offer_announcements,
    check_in_available           = EXCLUDED.check_in_available,
    we_miss_you                  = EXCLUDED.we_miss_you,
    reward_unlocked              = EXCLUDED.reward_unlocked,
    birthday                     = EXCLUDED.birthday,
    review_request               = EXCLUDED.review_request,
    updated_at                   = now()
  RETURNING * INTO r;
  RETURN r;
END;
$$;
GRANT EXECUTE ON FUNCTION public.update_business_notification_settings(
  uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean
) TO authenticated;


-- ── Per-customer preferences ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.customer_notification_preferences (
  membership_id                    uuid PRIMARY KEY REFERENCES public.business_memberships(id) ON DELETE CASCADE,
  -- Master kill switch — overrides everything below when false.
  push_enabled                     boolean NOT NULL DEFAULT true,
  -- Per-type opt-outs.
  streak_reminders                 boolean NOT NULL DEFAULT true,
  gift_expiration_reminders        boolean NOT NULL DEFAULT true,
  customer_offer_announcements     boolean NOT NULL DEFAULT true,
  check_in_available               boolean NOT NULL DEFAULT true,
  we_miss_you                      boolean NOT NULL DEFAULT true,
  reward_unlocked                  boolean NOT NULL DEFAULT true,
  birthday                         boolean NOT NULL DEFAULT true,
  review_request                   boolean NOT NULL DEFAULT true,
  updated_at                       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_notification_preferences ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  BEGIN DROP POLICY "cnp_self"  ON public.customer_notification_preferences; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN DROP POLICY "cnp_staff" ON public.customer_notification_preferences; EXCEPTION WHEN undefined_object THEN NULL; END;
END $$;

CREATE POLICY "cnp_self" ON public.customer_notification_preferences
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.business_memberships m WHERE m.id = membership_id AND m.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.business_memberships m WHERE m.id = membership_id AND m.user_id = auth.uid()));
CREATE POLICY "cnp_staff" ON public.customer_notification_preferences
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.business_memberships m
     WHERE m.id = membership_id
       AND public.staffs_business(m.business_id)
  ));


CREATE OR REPLACE FUNCTION public.get_my_notification_preferences(p_business_id uuid)
RETURNS public.customer_notification_preferences
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_m uuid;
  r public.customer_notification_preferences;
BEGIN
  SELECT id INTO v_m FROM public.business_memberships
    WHERE user_id = auth.uid() AND business_id = p_business_id LIMIT 1;
  IF v_m IS NULL THEN
    RAISE EXCEPTION 'no membership for this business';
  END IF;
  SELECT * INTO r FROM public.customer_notification_preferences WHERE membership_id = v_m;
  IF NOT FOUND THEN
    -- Defaults all-on.
    r.membership_id := v_m;
    r.push_enabled := true;
    r.streak_reminders := true;
    r.gift_expiration_reminders := true;
    r.customer_offer_announcements := true;
    r.check_in_available := true;
    r.we_miss_you := true;
    r.reward_unlocked := true;
    r.birthday := true;
    r.review_request := true;
    r.updated_at := now();
  END IF;
  RETURN r;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_notification_preferences(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.update_my_notification_preferences(
  p_business_id uuid,
  p_push_enabled                boolean,
  p_streak_reminders            boolean,
  p_gift_expiration_reminders   boolean,
  p_customer_offer_announcements boolean,
  p_check_in_available          boolean,
  p_we_miss_you                 boolean,
  p_reward_unlocked             boolean,
  p_birthday                    boolean,
  p_review_request              boolean
)
RETURNS public.customer_notification_preferences
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_m uuid;
  r public.customer_notification_preferences;
BEGIN
  SELECT id INTO v_m FROM public.business_memberships
    WHERE user_id = auth.uid() AND business_id = p_business_id LIMIT 1;
  IF v_m IS NULL THEN
    RAISE EXCEPTION 'no membership for this business';
  END IF;
  INSERT INTO public.customer_notification_preferences AS c
    (membership_id, push_enabled, streak_reminders, gift_expiration_reminders,
     customer_offer_announcements, check_in_available, we_miss_you,
     reward_unlocked, birthday, review_request, updated_at)
  VALUES
    (v_m, p_push_enabled, p_streak_reminders, p_gift_expiration_reminders,
     p_customer_offer_announcements, p_check_in_available, p_we_miss_you,
     p_reward_unlocked, p_birthday, p_review_request, now())
  ON CONFLICT (membership_id) DO UPDATE SET
    push_enabled                 = EXCLUDED.push_enabled,
    streak_reminders             = EXCLUDED.streak_reminders,
    gift_expiration_reminders    = EXCLUDED.gift_expiration_reminders,
    customer_offer_announcements = EXCLUDED.customer_offer_announcements,
    check_in_available           = EXCLUDED.check_in_available,
    we_miss_you                  = EXCLUDED.we_miss_you,
    reward_unlocked              = EXCLUDED.reward_unlocked,
    birthday                     = EXCLUDED.birthday,
    review_request               = EXCLUDED.review_request,
    updated_at                   = now()
  RETURNING * INTO r;
  RETURN r;
END;
$$;
GRANT EXECUTE ON FUNCTION public.update_my_notification_preferences(
  uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean
) TO authenticated;
