-- ─────────────────────────────────────────────────────────────────────────────
-- CP-28 — UI polish + points-only + birthday lock
-- ─────────────────────────────────────────────────────────────────────────────
-- Self-contained. Idempotent. Safe to re-run.
--
-- v2 (hotfix): the actual table is `public.profiles` with column `birthday`
-- (not `public.customers.date_of_birth`). Migration corrected.
--
-- What this migration does:
--   1) Locks `profiles.birthday` after it's first set. Any attempt to UPDATE
--      the column once it is non-null is silently ignored at the DB layer —
--      closes the "edit my birthday every month to keep collecting +250
--      points" loophole that the UI alone cannot guarantee.
--
--   2) Updates `update_my_profile` so the customer-facing edit form cannot
--      overwrite an existing birthday. Even if the client patches around the
--      disabled input, the server refuses the write.
--
--   3) Zeroes out `business_membership_billing.monthly_cash_balance_cents`
--      on every row and adds a trigger refusing any future non-zero write.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1) Birthday set-once trigger on profiles ────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_birthday_set_once()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.birthday IS NOT NULL
     AND NEW.birthday IS DISTINCT FROM OLD.birthday THEN
    -- Silently preserve the original birthday. The client UI also prevents
    -- the edit; this is defense-in-depth so direct table writes are also
    -- caught.
    NEW.birthday := OLD.birthday;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_birthday_set_once ON public.profiles;

CREATE TRIGGER trg_enforce_birthday_set_once
BEFORE UPDATE OF birthday ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_birthday_set_once();

-- ── 2) update_my_profile — refuse to overwrite an existing birthday ─────────
CREATE OR REPLACE FUNCTION public.update_my_profile(
  p_full_name text DEFAULT NULL,
  p_phone     text DEFAULT NULL,
  p_birthday  date DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_birthday date;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Read the current birthday so we can decide whether to update it.
  SELECT birthday INTO v_existing_birthday
  FROM public.profiles
  WHERE id = auth.uid();

  UPDATE public.profiles
  SET
    full_name = COALESCE(p_full_name, full_name),
    phone     = COALESCE(p_phone,     phone),
    -- Only set birthday when it has never been set before. Once non-null,
    -- the trigger above is a second backstop.
    birthday = CASE
      WHEN v_existing_birthday IS NULL THEN COALESCE(p_birthday, birthday)
      ELSE birthday
    END,
    updated_at = now()
  WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.update_my_profile(text, text, date) FROM public;
GRANT EXECUTE ON FUNCTION public.update_my_profile(text, text, date) TO authenticated;

-- ── 3) Zero out + lock the cash credit perk ─────────────────────────────────
-- The column stays so the existing upsert_membership_billing signature
-- doesn't break; we just guarantee it's always 0.

DO $$
BEGIN
  -- Only run if the table + column exist (safe on a fresh install).
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'business_membership_billing'
      AND column_name  = 'monthly_cash_balance_cents'
  ) THEN
    EXECUTE 'UPDATE public.business_membership_billing
             SET monthly_cash_balance_cents = 0
             WHERE monthly_cash_balance_cents IS DISTINCT FROM 0';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_no_cash_credit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Atlas is points-only as of CP-28. Quietly coerce any non-zero write
  -- back to 0 so a forgotten field somewhere can't accidentally re-enable
  -- the cash-credit perk product-wide.
  IF NEW.monthly_cash_balance_cents IS DISTINCT FROM 0 THEN
    NEW.monthly_cash_balance_cents := 0;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'business_membership_billing'
  ) THEN
    DROP TRIGGER IF EXISTS trg_no_cash_credit ON public.business_membership_billing;
    CREATE TRIGGER trg_no_cash_credit
      BEFORE INSERT OR UPDATE ON public.business_membership_billing
      FOR EACH ROW EXECUTE FUNCTION public.enforce_no_cash_credit();
  END IF;
END $$;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification queries — run these after applying to confirm the migration:
--
--   -- 1) The birthday trigger should exist
--   SELECT tgname FROM pg_trigger WHERE tgname = 'trg_enforce_birthday_set_once';
--
--   -- 2) update_my_profile should be SECURITY DEFINER + accept (text,text,date)
--   SELECT prosecdef FROM pg_proc WHERE proname = 'update_my_profile';
--
--   -- 3) Every membership row should have cash balance = 0
--   SELECT business_id, monthly_cash_balance_cents
--   FROM public.business_membership_billing
--   WHERE monthly_cash_balance_cents IS DISTINCT FROM 0;
--
--   -- 4) Try to update your own birthday once it's set — should be a no-op
--   --    UPDATE public.profiles SET birthday = '2000-01-01' WHERE id = auth.uid();
--   --    SELECT birthday FROM public.profiles WHERE id = auth.uid();
-- ─────────────────────────────────────────────────────────────────────────────
