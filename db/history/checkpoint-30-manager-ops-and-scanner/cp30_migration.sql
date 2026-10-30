-- ─────────────────────────────────────────────────────────────────────────────
-- CP-30 — Manager day-to-day ops (search + daily recap)
-- ─────────────────────────────────────────────────────────────────────────────
-- Self-contained. Idempotent. Safe to re-run.
--
-- What this migration adds:
--   1) search_members(p_business_id, p_q text) — fuzzy lookup of members
--      by name / email / phone / referral_code. Returns top 10. Used by
--      the new CustomerSearch bar on the Front desk view.
--
--   2) manager_daily_recap(p_business_id) — single-row snapshot of today's
--      activity (check-ins, points awarded, rewards redeemed, active
--      offers, new members). Used by the DailyRecapCard hero.
--
--   3) reverse_last_award(p_business_id, p_membership_id, p_within_seconds)
--      — atomic undo of the most recent positive ledger entry for a member
--      within a tight window. Used by the "Undo" button on the front desk
--      after a points grant.
--
-- All RPCs use SECURITY DEFINER and call public.staffs_business() so
-- only staff/manager/agency_admin can hit them (RLS already guards the
-- underlying tables, but failing fast in the RPC gives a clearer error).
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1) search_members ──────────────────────────────────────────────────────
-- Uses simple ILIKE (no pg_trgm dependency) so this runs on every Supabase
-- project without an extension install. Falls back to full table scan for
-- the rare super-small business that doesn't have a name index — fine.
DROP FUNCTION IF EXISTS public.search_members(uuid, text);

CREATE OR REPLACE FUNCTION public.search_members(
  p_business_id uuid,
  p_q           text
)
RETURNS TABLE (
  membership_id  uuid,
  user_id        uuid,
  full_name      text,
  email          text,
  phone          text,
  referral_code  text,
  points_balance integer,
  tier           text,
  joined_at      timestamptz,
  visit_count    integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_q text := nullif(btrim(p_q), '');
  v_like text;
  v_phone_digits text;
BEGIN
  IF NOT public.staffs_business(p_business_id) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;
  IF v_q IS NULL OR length(v_q) < 1 THEN
    RETURN;
  END IF;

  v_like := '%' || v_q || '%';
  -- Strip non-digits so phone matching works whether the staff typed
  -- "5551234567", "(555) 123-4567", or "555-123-4567".
  v_phone_digits := regexp_replace(v_q, '[^0-9]', '', 'g');

  RETURN QUERY
    SELECT m.id, m.user_id, p.full_name, p.email, p.phone, m.referral_code,
           m.points_balance, m.tier, m.joined_at, m.visit_count
      FROM public.business_memberships m
      JOIN public.profiles p ON p.id = m.user_id
     WHERE m.business_id = p_business_id
       AND (
         p.full_name ILIKE v_like
         OR p.email   ILIKE v_like
         OR (length(v_phone_digits) >= 3
             AND regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g') ILIKE '%' || v_phone_digits || '%')
         OR m.referral_code ILIKE upper(v_q) || '%'
       )
     ORDER BY
       -- Exact code match wins, then name starts-with, then everything else.
       CASE WHEN m.referral_code = upper(v_q) THEN 0
            WHEN p.full_name ILIKE v_q || '%' THEN 1
            ELSE 2 END,
       coalesce(m.last_visit_at, m.joined_at) DESC
     LIMIT 10;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_members(uuid, text) TO authenticated;

-- ── 2) manager_daily_recap ─────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.manager_daily_recap(uuid);

CREATE OR REPLACE FUNCTION public.manager_daily_recap(p_business_id uuid)
RETURNS TABLE (
  check_ins_today     integer,
  points_awarded_today integer,
  rewards_redeemed_today integer,
  active_offers       integer,
  new_members_today   integer,
  check_ins_week      integer,
  points_awarded_week integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today_start timestamptz := date_trunc('day', now());
  v_week_start  timestamptz := date_trunc('day', now()) - interval '6 days';
BEGIN
  IF NOT public.staffs_business(p_business_id) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  RETURN QUERY
  SELECT
    -- Today
    (SELECT count(*)::int
       FROM public.check_in_events c
       JOIN public.business_memberships m ON m.id = c.membership_id
      WHERE m.business_id = p_business_id AND c.created_at >= v_today_start),
    (SELECT coalesce(sum(GREATEST(delta, 0)), 0)::int
       FROM public.points_ledger
      WHERE business_id = p_business_id AND created_at >= v_today_start),
    (SELECT count(*)::int
       FROM public.redemptions
      WHERE business_id = p_business_id
        AND status IN ('pending','fulfilled')
        AND created_at >= v_today_start),
    (SELECT count(*)::int
       FROM public.offers
      WHERE business_id = p_business_id
        AND is_active
        AND (expires_at IS NULL OR expires_at > now())),
    (SELECT count(*)::int
       FROM public.business_memberships
      WHERE business_id = p_business_id AND joined_at >= v_today_start),
    -- Week
    (SELECT count(*)::int
       FROM public.check_in_events c
       JOIN public.business_memberships m ON m.id = c.membership_id
      WHERE m.business_id = p_business_id AND c.created_at >= v_week_start),
    (SELECT coalesce(sum(GREATEST(delta, 0)), 0)::int
       FROM public.points_ledger
      WHERE business_id = p_business_id AND created_at >= v_week_start);
END;
$$;

GRANT EXECUTE ON FUNCTION public.manager_daily_recap(uuid) TO authenticated;

-- ── 3) reverse_last_award ──────────────────────────────────────────────────
-- Inserts a compensating `reversal` ledger entry that exactly negates the
-- most recent positive entry for the member in the given window. Updates
-- balance_after of both entries' membership snapshots is unnecessary —
-- the balance is recomputed in the trigger that already exists for
-- points_ledger inserts (see CP-01 schema). If your environment doesn't
-- have such a trigger, this RPC also updates business_memberships
-- directly. (Both safe to coexist.)
DROP FUNCTION IF EXISTS public.reverse_last_award(uuid, uuid, integer);

CREATE OR REPLACE FUNCTION public.reverse_last_award(
  p_business_id   uuid,
  p_membership_id uuid,
  p_within_seconds integer DEFAULT 60
)
RETURNS TABLE (
  reversed_ledger_id uuid,
  delta              integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row       record;
  v_new_id    uuid;
  v_new_bal   integer;
BEGIN
  IF NOT public.staffs_business(p_business_id) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  SELECT id, delta, balance_after
    INTO v_row
    FROM public.points_ledger
   WHERE business_id   = p_business_id
     AND membership_id = p_membership_id
     AND delta > 0
     AND rule_type <> 'reversal'
     AND created_at > now() - make_interval(secs => p_within_seconds)
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_row IS NULL THEN
    RAISE EXCEPTION 'no recent positive ledger entry to reverse';
  END IF;

  -- Compute the new balance by subtracting the reversed delta.
  v_new_bal := v_row.balance_after - v_row.delta;

  INSERT INTO public.points_ledger
    (membership_id, business_id, delta, rule_type, reference_id,
     idempotency_key, balance_after)
  VALUES
    (p_membership_id, p_business_id, -v_row.delta, 'reversal', v_row.id,
     'rev-' || v_row.id::text, v_new_bal)
  RETURNING id INTO v_new_id;

  -- Best-effort balance sync (idempotent — no harm if a trigger already did it).
  UPDATE public.business_memberships
     SET points_balance = v_new_bal
   WHERE id = p_membership_id;

  RETURN QUERY SELECT v_new_id, -v_row.delta;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reverse_last_award(uuid, uuid, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification:
--   SELECT proname, pronargs FROM pg_proc
--   WHERE proname IN ('search_members','manager_daily_recap','reverse_last_award');
--
--   SELECT * FROM public.search_members('<business_id>', 'Andrew');
--   SELECT * FROM public.manager_daily_recap('<business_id>');
-- ─────────────────────────────────────────────────────────────────────────────
