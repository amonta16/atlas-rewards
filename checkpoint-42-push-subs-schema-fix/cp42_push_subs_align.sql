-- =====================================================================
-- CP-42 HOTFIX — Align push_subscriptions table with CP-32 code
-- =====================================================================
-- The table was originally created in CP-12 with columns:
--   p256dh_key, auth_key, business_id NOT NULL,
--   UNIQUE (user_id, business_id, endpoint)
--
-- CP-32's `CREATE TABLE IF NOT EXISTS` was a no-op against that legacy
-- table, so the route code (which inserts `p256dh`, `auth`, and uses
-- onConflict `(user_id, endpoint)`) has been failing with PGRST204:
--   "Could not find the 'auth' column of 'push_subscriptions' ..."
--
-- This migration brings the table forward without dropping data. It is
-- safe to run on a fresh database too — every step is guarded.
-- =====================================================================

-- 1. Rename legacy columns if they still exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'push_subscriptions'
      AND column_name = 'p256dh_key'
  ) THEN
    ALTER TABLE public.push_subscriptions RENAME COLUMN p256dh_key TO p256dh;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'push_subscriptions'
      AND column_name = 'auth_key'
  ) THEN
    ALTER TABLE public.push_subscriptions RENAME COLUMN auth_key TO auth;
  END IF;
END $$;

-- 2. If the legacy table was never even created (fresh DB), make it now.
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id   uuid REFERENCES public.businesses(id) ON DELETE CASCADE,
  endpoint      text NOT NULL,
  p256dh        text NOT NULL,
  auth          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now()
);

-- 3. Make sure both target columns exist (covers half-migrated states)
ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS p256dh       text,
  ADD COLUMN IF NOT EXISTS auth         text,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now();

-- 4. business_id should be nullable so users on root domain can subscribe
ALTER TABLE public.push_subscriptions
  ALTER COLUMN business_id DROP NOT NULL;

-- 5. Drop the legacy 3-column uniqueness and re-create on (user_id, endpoint)
DO $$
DECLARE
  c text;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.push_subscriptions'::regclass
      AND contype  = 'u'
  LOOP
    EXECUTE 'ALTER TABLE public.push_subscriptions DROP CONSTRAINT ' || quote_ident(c);
  END LOOP;
END $$;

ALTER TABLE public.push_subscriptions
  ADD CONSTRAINT push_subscriptions_user_endpoint_key UNIQUE (user_id, endpoint);

-- 6. Make sure RLS is on and the self-only policy exists
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_self" ON public.push_subscriptions;
CREATE POLICY "push_self" ON public.push_subscriptions
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 7. Helpful index
CREATE INDEX IF NOT EXISTS push_subs_business
  ON public.push_subscriptions (business_id);

-- 8. Tell PostgREST to reload its schema cache so the column-rename
--    is visible to the REST layer immediately (no Supabase restart needed).
NOTIFY pgrst, 'reload schema';
