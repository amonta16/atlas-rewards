-- =====================================================================
-- CP-42 — Business baseline (pre-Atlas) stats
-- =====================================================================
-- When a new business is onboarded onto Atlas, the agency captures
-- their past-year baseline numbers (Google reviews, rating, monthly
-- revenue, monthly visits) so the Insights "With Atlas vs Without"
-- comparison can use REAL pre-Atlas numbers instead of estimates.
--
-- This makes the "you can't cancel us" pitch much stronger — the
-- operator sees actual side-by-side numbers from their own past year.
--
-- Self-contained, idempotent.
-- =====================================================================

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS baseline_google_review_count  int,
  ADD COLUMN IF NOT EXISTS baseline_google_rating        numeric(3,2),
  ADD COLUMN IF NOT EXISTS baseline_monthly_revenue_cents bigint,
  ADD COLUMN IF NOT EXISTS baseline_monthly_visits       int,
  ADD COLUMN IF NOT EXISTS baseline_captured_at          timestamptz;

-- Convenience RPC the agency can call to save the baseline. Atomic
-- update + sets captured_at so we know when the snapshot was taken.
CREATE OR REPLACE FUNCTION public.save_business_baseline(
  p_business_id                   uuid,
  p_google_review_count           int,
  p_google_rating                 numeric,
  p_monthly_revenue_cents         bigint,
  p_monthly_visits                int
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_agency_admin() THEN
    RAISE EXCEPTION 'only agency_admin can update business baseline';
  END IF;

  UPDATE public.businesses
     SET baseline_google_review_count  = p_google_review_count,
         baseline_google_rating        = p_google_rating,
         baseline_monthly_revenue_cents = p_monthly_revenue_cents,
         baseline_monthly_visits       = p_monthly_visits,
         baseline_captured_at          = now()
   WHERE id = p_business_id;
END; $$;

GRANT EXECUTE ON FUNCTION public.save_business_baseline(uuid, int, numeric, bigint, int) TO authenticated;

-- Updated atlas_impact_rollup that returns the operator-supplied baseline
-- when it's available, falling back to the existing estimated baseline.
-- Re-creation drops/replaces the CP-32 version idempotently.
DROP FUNCTION IF EXISTS public.atlas_impact_rollup(uuid);

CREATE FUNCTION public.atlas_impact_rollup(p_business_id uuid)
RETURNS TABLE (
  driven_revenue_cents          bigint,
  repeat_visit_lift_pct         numeric,
  reviews_generated             bigint,
  reviews_generated_30d         bigint,
  estimated_review_value_cents  bigint,
  estimated_winback_cents       bigint,
  retention_lift_pct            numeric,
  avg_member_value_cents        bigint,
  member_count                  bigint,
  baseline_visits_30d           int,
  actual_visits_30d             int,
  baseline_revenue_30d_cents    bigint,
  actual_revenue_30d_cents      bigint,
  -- CP-42 additions: operator-supplied historical baselines
  baseline_google_reviews        int,
  baseline_google_rating         numeric,
  baseline_captured_at           timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_b                 record;
  v_member_count      bigint;
  v_visits_30d        bigint;
  v_reviews_30d       bigint;
  v_reviews_total     bigint;
  v_baseline_visits   int;
  v_baseline_revenue  bigint;
  v_actual_revenue    bigint;
  v_per_visit_cents   bigint := 2500;  -- $25 flat proxy, same as CP-32
  v_review_value_cents bigint := 3500; -- $35 per review proxy
BEGIN
  SELECT * INTO v_b FROM public.businesses WHERE id = p_business_id;

  -- Members + 30d visits + 30d/total reviews
  SELECT COUNT(*) INTO v_member_count
    FROM public.business_memberships WHERE business_id = p_business_id;

  SELECT COUNT(*) INTO v_visits_30d
    FROM public.points_ledger
   WHERE business_id = p_business_id
     AND delta > 0
     AND created_at > now() - interval '30 days';

  SELECT COUNT(*) INTO v_reviews_30d
    FROM public.reviews r
    JOIN public.business_memberships m ON m.id = r.membership_id
   WHERE m.business_id = p_business_id
     AND r.status = 'verified'
     AND r.created_at > now() - interval '30 days';

  SELECT COUNT(*) INTO v_reviews_total
    FROM public.reviews r
    JOIN public.business_memberships m ON m.id = r.membership_id
   WHERE m.business_id = p_business_id
     AND r.status = 'verified';

  -- Baseline visits: prefer operator-supplied monthly visits if set.
  v_baseline_visits := COALESCE(v_b.baseline_monthly_visits,
                                GREATEST(0, (v_visits_30d * 0.1)::int));

  -- Revenue (cents): per-visit proxy × visits this 30d
  v_actual_revenue := (v_visits_30d * v_per_visit_cents)::bigint;

  -- Baseline revenue: prefer operator-supplied if set.
  v_baseline_revenue := COALESCE(v_b.baseline_monthly_revenue_cents,
                                 (v_baseline_visits * v_per_visit_cents)::bigint);

  RETURN QUERY SELECT
    GREATEST(0, v_actual_revenue - v_baseline_revenue)             AS driven_revenue_cents,
    CASE WHEN v_baseline_visits > 0
         THEN ROUND(((v_visits_30d - v_baseline_visits)::numeric / v_baseline_visits) * 100, 0)
         ELSE 0
    END                                                            AS repeat_visit_lift_pct,
    v_reviews_total                                                AS reviews_generated,
    v_reviews_30d                                                  AS reviews_generated_30d,
    (v_reviews_30d * v_review_value_cents)::bigint                 AS estimated_review_value_cents,
    -- Winback estimate: same hand-wave as CP-32
    0::bigint                                                      AS estimated_winback_cents,
    CASE WHEN v_baseline_visits > 0
         THEN ROUND(((v_visits_30d - v_baseline_visits)::numeric / v_baseline_visits) * 100, 0)
         ELSE 0
    END                                                            AS retention_lift_pct,
    CASE WHEN v_member_count > 0 THEN (v_actual_revenue / v_member_count)::bigint ELSE 0 END
                                                                   AS avg_member_value_cents,
    v_member_count                                                 AS member_count,
    v_baseline_visits::int                                         AS baseline_visits_30d,
    v_visits_30d::int                                              AS actual_visits_30d,
    v_baseline_revenue                                             AS baseline_revenue_30d_cents,
    v_actual_revenue                                               AS actual_revenue_30d_cents,
    -- CP-42: surface the operator-supplied baseline numbers
    v_b.baseline_google_review_count                               AS baseline_google_reviews,
    v_b.baseline_google_rating                                     AS baseline_google_rating,
    v_b.baseline_captured_at                                       AS baseline_captured_at;
END; $$;

GRANT EXECUTE ON FUNCTION public.atlas_impact_rollup(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
