-- =====================================================================
-- CP-37.3 hotfix — review-funnel dummy data + stuck-invitee confirm
-- =====================================================================
-- Fixes:
--   1) atlas_review_funnel was returning hardcoded 4.2 / 4.7 when the
--      real averages were null. The Insights "Before Atlas → Now" panel
--      treats null as "hide" — so removing the fallback hides the
--      entire stat until there's actual verified-review data.
--
--   2) Confirm email for every existing auth.users row that's been
--      stuck unconfirmed since the old client-side signUp flow.
--      Their CP-37.3 successor (/api/team/accept-signup) sets
--      email_confirm:true on create, so all new invitees are fine —
--      this is purely a backfill for the friends already half-stuck.
-- =====================================================================


-- ---------------------------------------------------------------------
-- (1) atlas_review_funnel — return NULL instead of 4.2 / 4.7 fallbacks
-- ---------------------------------------------------------------------
-- The function shape is unchanged; only the COALESCE defaults are
-- dropped. The Insights panel already has a `if (before == null || after == null) return null`
-- guard, so the stat row hides itself until there's real data.

CREATE OR REPLACE FUNCTION public.atlas_review_funnel(p_business_id uuid)
RETURNS TABLE (
  asks_30d           bigint,
  submitted_30d      bigint,
  verified_30d       bigint,
  star_avg_before    numeric,
  star_avg_after     numeric,
  reviews_lifetime   bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_first_review_at timestamptz;
BEGIN
  SELECT min(verified_at) INTO v_first_review_at
    FROM public.reviews
   WHERE business_id = p_business_id AND status = 'verified';

  RETURN QUERY
    SELECT
      -- Asks (member-base proxy)
      (SELECT count(*)::bigint
         FROM public.business_memberships
        WHERE business_id = p_business_id
          AND joined_at >= now() - interval '30 days'),
      -- Submitted in last 30d
      (SELECT count(*)::bigint FROM public.reviews
        WHERE business_id = p_business_id
          AND submitted_at >= now() - interval '30 days'),
      -- Verified in last 30d
      (SELECT count(*)::bigint FROM public.reviews
        WHERE business_id = p_business_id AND status = 'verified'
          AND coalesce(verified_at, submitted_at) >= now() - interval '30 days'),
      -- CP-37.3: NO fallback. If there are no verified reviews in
      -- the relevant window, return NULL so the UI hides the panel
      -- instead of pretending Atlas lifted 4.2 → 4.7 from nothing.
      (SELECT avg((verification_data->>'rating')::numeric)
         FROM public.reviews
        WHERE business_id = p_business_id
          AND status = 'verified'
          AND v_first_review_at IS NOT NULL
          AND verified_at < v_first_review_at + interval '30 days'),
      (SELECT avg((verification_data->>'rating')::numeric)
         FROM public.reviews
        WHERE business_id = p_business_id
          AND status = 'verified'
          AND verified_at >= now() - interval '30 days'),
      -- Lifetime verified count
      (SELECT count(*)::bigint FROM public.reviews
        WHERE business_id = p_business_id AND status = 'verified');
END; $$;

GRANT EXECUTE ON FUNCTION public.atlas_review_funnel(uuid) TO authenticated;


-- ---------------------------------------------------------------------
-- (2) Stuck-invitee backfill — confirm any auth.users still in the
--     "created via invite but email never confirmed" state, scoped to
--     emails that have a pending_invitations row. We intentionally
--     skip random unconfirmed signups (customers who legitimately
--     haven't confirmed yet) — only invitees get this rescue.
-- ---------------------------------------------------------------------

DO $$
DECLARE
  v_rescued int := 0;
BEGIN
  UPDATE auth.users u
     SET email_confirmed_at = COALESCE(u.email_confirmed_at, now())
   WHERE u.email_confirmed_at IS NULL
     AND EXISTS (
       SELECT 1 FROM public.pending_invitations pi
        WHERE lower(pi.email) = lower(u.email::text)
     );

  GET DIAGNOSTICS v_rescued = ROW_COUNT;
  RAISE NOTICE 'CP-37.3 backfill: confirmed % stuck invitee accounts.', v_rescued;
END $$;


NOTIFY pgrst, 'reload schema';
