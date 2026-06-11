-- =====================================================================
-- CP-46 — invite fix · welcome-gift reveal · manager metrics
-- =====================================================================
-- Idempotent. Apply in the Supabase SQL editor (whole file at once).
--
-- 1. TEAM INVITES — kill "Database error finding user".
--    Root cause: admin_provision_account INSERTed the auth.users row via
--    raw SQL. GoTrue's generateLink({type:'magiclink'}) then can't load
--    that row (missing identity / NULL token columns) → "Database error
--    finding user". Fix: the API route now creates the auth user through
--    the Admin SDK (a GoTrue-valid row + identity), and the SQL side only
--    does the permission gate + role wiring. Two new RPCs:
--      • team_invite_precheck(email, role, business_id)
--          permission gate (raises on denial, so we never create an
--          orphan auth user) + returns the existing auth uid or NULL.
--      • attach_team_role(user_id, role, business_id, full_name)
--          profiles upsert + business_users insert, gate re-checked.
--    admin_provision_account is left in place (harmless) but no longer
--    on the invite path.
--
-- 2. WELCOME GIFT — make points-bonus welcomes actually SHOW UP.
--    The CP-37 trigger credited points for an "Award Points" welcome but
--    created NO saved-offer row, so my_unrevealed_welcome_gift returned
--    nothing and the reveal popup never fired. (CP-42 v2 had also
--    clobbered the points credit entirely.) New v4 trigger:
--      • points_bonus  → credit points immediately AND drop a saved-offer
--        row (fulfilled_at = now() so it's not a pending redeemable) so
--        the reveal still pops "+N pts".
--      • reward/percent/flat → unchanged (saved offer, redeemable).
--    my_unrevealed_welcome_gift no longer requires fulfilled_at IS NULL,
--    so the points-bonus reveal shows once per member.
--
-- 3. MANAGER METRICS — manager_daily_series(business, days) powers the
--    new front-desk trend graphs (check-ins + points per day).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1a. team_invite_precheck — permission gate + existing-uid lookup
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.team_invite_precheck(text, text, uuid);

CREATE OR REPLACE FUNCTION public.team_invite_precheck(
  p_email       text,
  p_role        text,
  p_business_id uuid
)
RETURNS uuid                              -- existing auth uid, or NULL
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_email  text := lower(btrim(p_email));
  v_uid    uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF p_role NOT IN ('agency_admin','business_manager','business_staff') THEN
    RAISE EXCEPTION 'invalid role: %', p_role;
  END IF;
  IF p_role <> 'agency_admin' AND p_business_id IS NULL THEN
    RAISE EXCEPTION 'business_id required for role %', p_role;
  END IF;

  -- Permission gate — identical policy to admin_provision_account.
  IF EXISTS (
    SELECT 1 FROM public.business_users bu
     WHERE bu.user_id = v_caller AND bu.role = 'agency_admin'
  ) THEN
    NULL;                              -- agency_admin: anything
  ELSIF p_role IN ('business_manager','business_staff')
        AND p_business_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.business_users bu
           WHERE bu.user_id = v_caller AND bu.role = 'business_manager'
             AND bu.business_id = p_business_id
        )
  THEN
    NULL;                              -- manager: own business, mgr/front-desk
  ELSE
    RAISE EXCEPTION 'permission denied for role %', p_role;
  END IF;

  SELECT u.id INTO v_uid FROM auth.users u WHERE lower(u.email::text) = v_email;
  RETURN v_uid;                        -- NULL when the email is new
END; $$;

GRANT EXECUTE ON FUNCTION public.team_invite_precheck(text, text, uuid) TO authenticated;


-- ---------------------------------------------------------------------
-- 1b. attach_team_role — wire profile + role (no auth.users writes)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.attach_team_role(uuid, text, uuid, text);

CREATE OR REPLACE FUNCTION public.attach_team_role(
  p_user_id     uuid,
  p_role        text,
  p_business_id uuid,
  p_full_name   text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_email  text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Re-check permission (defense in depth — never trust the route alone).
  IF EXISTS (
    SELECT 1 FROM public.business_users bu
     WHERE bu.user_id = v_caller AND bu.role = 'agency_admin'
  ) THEN
    NULL;
  ELSIF p_role IN ('business_manager','business_staff')
        AND p_business_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.business_users bu
           WHERE bu.user_id = v_caller AND bu.role = 'business_manager'
             AND bu.business_id = p_business_id
        )
  THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'permission denied for role %', p_role;
  END IF;

  SELECT lower(u.email::text) INTO v_email FROM auth.users u WHERE u.id = p_user_id;
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'user % not found', p_user_id;
  END IF;

  INSERT INTO public.profiles (id, full_name, email)
  VALUES (p_user_id, COALESCE(p_full_name, ''), v_email)
  ON CONFLICT (id) DO UPDATE
    SET email     = EXCLUDED.email,
        full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), public.profiles.full_name);

  -- Replace any existing role row for this (user, business) pair so the
  -- invite is idempotent and role changes take effect.
  DELETE FROM public.business_users bu
   WHERE bu.user_id = p_user_id
     AND COALESCE(bu.business_id, '00000000-0000-0000-0000-000000000000'::uuid)
       = COALESCE(p_business_id, '00000000-0000-0000-0000-000000000000'::uuid);

  INSERT INTO public.business_users (user_id, business_id, role)
  VALUES (p_user_id, p_business_id, p_role);
END; $$;

GRANT EXECUTE ON FUNCTION public.attach_team_role(uuid, text, uuid, text) TO authenticated;


-- ---------------------------------------------------------------------
-- 2a. Welcome-gift trigger v4 — points-bonus now ALSO reveals
-- ---------------------------------------------------------------------
-- Why the old trigger silently failed to credit the welcome points:
--   • award_points() got a CP-44 auth gate that rejects positive awards
--     unless the caller staffs the business. During signup the caller IS
--     the new customer, so the trigger's award_points() call always
--     raised 'permission denied'. We now credit INLINE inside this
--     SECURITY DEFINER trigger (trusted context) instead of calling
--     award_points, sidestepping the gate.
--
-- NOTE: we deliberately do NOT touch the points_ledger rule_type CHECK
-- constraint. CP-44.1 (cp44_ledger_fix.sql) already DROPPED it on purpose
-- — rule_type is only ever set by SECURITY DEFINER RPCs, and newer
-- features write values like 'mystery_bonus' / 'streak_milestone' /
-- 'winback_bonus' that an enum would reject. Re-adding any enumerated
-- constraint re-validates historical rows and fails (error 23514). So
-- 'signup_bonus' just inserts cleanly against the (now constraint-free)
-- column. Make sure cp44_ledger_fix.sql has been applied.
DROP TRIGGER IF EXISTS trg_welcome_gift ON public.business_memberships;
DROP FUNCTION IF EXISTS public._fire_welcome_gifts_for_new_member();

CREATE OR REPLACE FUNCTION public._fire_welcome_gifts_for_new_member()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o         record;
  v_master  uuid;
  v_title   text;
  v_body    text;
  v_image   text;
  v_voice   text;
  v_expires timestamptz;
  v_idem    text;
  v_points  boolean;
  v_bal     integer;
BEGIN
  FOR o IN
    SELECT bao.id            AS config_id,
           bao.custom_title,
           bao.custom_description,
           bao.custom_image_url,
           bao.voice_message_url,
           bao.expires_after_days,
           bao.discount_type  AS bao_discount_type,
           bao.discount_value AS bao_discount_value,
           bao.gift_reward_id AS bao_gift_reward_id,
           t.name             AS template_name,
           t.emoji            AS template_emoji,
           t.trigger_type
      FROM public.business_automated_offers bao
      JOIN public.automated_offer_templates t ON t.id = bao.template_id
     WHERE bao.business_id = NEW.business_id
       AND bao.is_active   = true
       AND t.trigger_type  = 'signup'
  LOOP
    v_title   := COALESCE(o.custom_title, o.template_emoji || ' ' || o.template_name);
    v_body    := o.custom_description;
    v_image   := o.custom_image_url;
    v_voice   := o.voice_message_url;
    v_expires := now() + (COALESCE(o.expires_after_days, 30) || ' days')::interval;
    v_points  := (o.bao_discount_type = 'points_bonus' AND COALESCE(o.bao_discount_value, 0) > 0);

    -- Points-bonus → credit immediately, INLINE (idempotent on
    -- membership+config). We don't call award_points() because its CP-44
    -- auth gate rejects positive awards from a non-staff caller, and the
    -- caller here is the signing-up customer.
    IF v_points THEN
      v_idem := 'welcome_points:' || NEW.id::text || ':' || o.config_id::text;
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM public.points_ledger WHERE idempotency_key = v_idem) THEN
          UPDATE public.business_memberships
             SET points_balance         = points_balance + o.bao_discount_value,
                 lifetime_points_earned = lifetime_points_earned + o.bao_discount_value,
                 updated_at             = now()
           WHERE id = NEW.id
          RETURNING points_balance INTO v_bal;

          INSERT INTO public.points_ledger
            (membership_id, business_id, delta, rule_type, reference_id,
             idempotency_key, balance_after, notes, created_by)
          VALUES
            (NEW.id, NEW.business_id, o.bao_discount_value, 'signup_bonus',
             o.config_id, v_idem, v_bal,
             'Welcome bonus from ' || COALESCE(v_title, 'signup gift'), NEW.user_id);

          BEGIN PERFORM public.recalc_tier(NEW.id); EXCEPTION WHEN OTHERS THEN NULL; END;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'welcome points credit failed: %', SQLERRM;
      END;
    END IF;

    -- Master offer row (one per config) — carries everything the reveal
    -- popup + saved-gift list read.
    SELECT id INTO v_master FROM public.offers WHERE welcome_config_id = o.config_id;

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
          COALESCE(o.bao_discount_type, 'none'), o.bao_discount_value, o.bao_gift_reward_id
        )
        RETURNING id INTO v_master;
      EXCEPTION WHEN unique_violation THEN
        SELECT id INTO v_master FROM public.offers WHERE welcome_config_id = o.config_id;
      WHEN OTHERS THEN
        RAISE WARNING 'welcome master offer insert failed: %', SQLERRM;
        v_master := NULL;
      END;
    ELSE
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
      -- Per-member saved row → drives the once-per-member reveal popup.
      -- points_bonus: mark fulfilled (points already in the account) so it
      -- doesn't sit in the redeemable saved-gifts list, but it STILL
      -- reveals (my_unrevealed_welcome_gift no longer gates on fulfilled).
      BEGIN
        INSERT INTO public.customer_saved_offers
          (membership_id, offer_id, business_id, fulfilled_at)
        VALUES
          (NEW.id, v_master, NEW.business_id, CASE WHEN v_points THEN now() ELSE NULL END)
        ON CONFLICT (membership_id, offer_id) DO NOTHING;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'welcome gift saved_offer insert failed: %', SQLERRM;
      END;

      BEGIN
        INSERT INTO public.notifications
          (user_id, business_id, kind, title, body, link_path)
        VALUES
          (NEW.user_id, NEW.business_id, 'automated_offer',
           CASE WHEN v_points
                THEN '🎁 +' || o.bao_discount_value::text || ' welcome points!'
                ELSE '🎁 A welcome gift just dropped' END,
           COALESCE(v_body, 'Tap to see what''s waiting on your Home tab.'),
           '/app');
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'welcome gift notification insert failed: %', SQLERRM;
      END;
    END IF;

    UPDATE public.business_automated_offers SET last_triggered_at = now()
     WHERE id = o.config_id;
  END LOOP;

  RETURN NEW;
END; $$;

CREATE TRIGGER trg_welcome_gift
  AFTER INSERT ON public.business_memberships
  FOR EACH ROW EXECUTE FUNCTION public._fire_welcome_gifts_for_new_member();


-- ---------------------------------------------------------------------
-- 2b. my_unrevealed_welcome_gift — drop the fulfilled_at gate
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.my_unrevealed_welcome_gift(uuid);

CREATE OR REPLACE FUNCTION public.my_unrevealed_welcome_gift(p_business_id uuid)
RETURNS TABLE (
  saved_id          uuid,
  offer_id          uuid,
  title             text,
  description       text,
  image_url         text,
  voice_message_url text,
  discount_type     text,
  discount_value    int,
  gift_reward_name  text,
  expires_at        timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT cso.id, o.id,
         o.title, o.description, o.image_url, o.voice_message_url,
         o.discount_type, o.discount_value,
         rw.name,
         o.expires_at
    FROM public.customer_saved_offers cso
    JOIN public.business_memberships m ON m.id = cso.membership_id
    JOIN public.offers o               ON o.id = cso.offer_id
    LEFT JOIN public.rewards rw        ON rw.id = o.gift_reward_id
   WHERE m.user_id = auth.uid()
     AND cso.business_id = p_business_id
     AND cso.revealed_at IS NULL              -- once per member
     AND o.welcome_config_id IS NOT NULL
     AND o.is_active
     AND (o.expires_at IS NULL OR o.expires_at > now())
   ORDER BY cso.saved_at DESC
   LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.my_unrevealed_welcome_gift(uuid) TO authenticated;


-- ---------------------------------------------------------------------
-- 3. manager_daily_series — per-day check-ins + points for the front-desk
--    trend graphs. RLS-safe: SECURITY DEFINER but scoped to the passed
--    business; the manager dashboard only ever calls it for its own.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.manager_daily_series(uuid, integer);

CREATE OR REPLACE FUNCTION public.manager_daily_series(
  p_business_id uuid,
  p_days        integer DEFAULT 14
)
RETURNS TABLE (
  day            date,
  check_ins      integer,
  points_awarded integer,
  new_members    integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  -- Access guard: only staff of this business (or an agency_admin) get rows.
  WITH guard AS (SELECT public.staffs_business(p_business_id) AS ok),
  days AS (
    SELECT generate_series(
             (now() AT TIME ZONE 'utc')::date - (GREATEST(p_days, 1) - 1),
             (now() AT TIME ZONE 'utc')::date,
             interval '1 day')::date AS d
  ),
  ci AS (
    SELECT created_at::date AS d, count(*)::int AS n
      FROM public.check_in_events
     WHERE business_id = p_business_id
       AND created_at >= now() - (GREATEST(p_days, 1) || ' days')::interval
     GROUP BY 1
  ),
  pts AS (
    SELECT created_at::date AS d, COALESCE(sum(delta), 0)::int AS n
      FROM public.points_ledger
     WHERE business_id = p_business_id
       AND delta > 0
       AND created_at >= now() - (GREATEST(p_days, 1) || ' days')::interval
     GROUP BY 1
  ),
  nm AS (
    SELECT joined_at::date AS d, count(*)::int AS n
      FROM public.business_memberships
     WHERE business_id = p_business_id
       AND joined_at >= now() - (GREATEST(p_days, 1) || ' days')::interval
     GROUP BY 1
  )
  SELECT days.d,
         COALESCE(ci.n, 0),
         COALESCE(pts.n, 0),
         COALESCE(nm.n, 0)
    FROM days
    CROSS JOIN guard
    LEFT JOIN ci  ON ci.d  = days.d
    LEFT JOIN pts ON pts.d = days.d
    LEFT JOIN nm  ON nm.d  = days.d
   WHERE guard.ok
   ORDER BY days.d;
$$;
GRANT EXECUTE ON FUNCTION public.manager_daily_series(uuid, integer) TO authenticated;


NOTIFY pgrst, 'reload schema';
