-- =====================================================================
-- CP-45 — Bug-fix checkpoint: invites + welcome gift reveal
-- =====================================================================
-- Idempotent. Apply in the Supabase SQL editor.
--
-- 1. admin_provision_account — fixes the toast Andrew hit on every
--    invite: `column reference "user_id" is ambiguous`. The function
--    declares RETURNS TABLE (user_id uuid, ...), and PL/pgSQL treats
--    that return column as a VARIABLE named user_id. Every unqualified
--    `WHERE user_id = ...` against business_users then collides with
--    it at runtime. Same class of bug as the CP-40 `token` fix.
--    Fix: table-alias every query in the body (bu.user_id).
--
-- 2. Welcome gift reveal, per-member + server-tracked. The old reveal
--    relied on featured_offer() (business-wide) + a per-DEVICE
--    localStorage seen list. Result: the second account created on the
--    same device — or any business with a featured offer — never saw
--    the welcome popup or its voice note. New model:
--      • customer_saved_offers.revealed_at column
--      • my_unrevealed_welcome_gift(business) — the caller's own
--        un-revealed welcome gift, with voice + discount + reward name
--      • mark_welcome_gift_revealed(saved_id) — caller-owned only
--    The popup now fires once per MEMBER (any device), not per device.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. admin_provision_account — ambiguity fix
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_provision_account(text, text, text, uuid, text);

CREATE OR REPLACE FUNCTION public.admin_provision_account(
  p_email       text,
  p_password    text,
  p_role        text,
  p_business_id uuid,   -- NULL for agency_admin
  p_full_name   text DEFAULT NULL
)
RETURNS TABLE (user_id uuid, created_new boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller   uuid := auth.uid();
  v_email    text := lower(btrim(p_email));
  v_uid      uuid;
  v_created  boolean := false;
  v_pw_hash  text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- ─── Permission gate ────────────────────────────────────────
  -- NOTE: every business_users reference is table-aliased (bu) so the
  -- RETURNS TABLE column `user_id` can never shadow the table column.
  IF EXISTS (
    SELECT 1 FROM public.business_users bu
     WHERE bu.user_id = v_caller AND bu.role = 'agency_admin'
  ) THEN
    NULL; -- agency_admin: can provision anything
  ELSIF p_role IN ('business_manager','business_staff')
        AND p_business_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.business_users bu
           WHERE bu.user_id = v_caller AND bu.role = 'business_manager'
             AND bu.business_id = p_business_id
        )
  THEN
    NULL; -- manager: own business, manager/front-desk only
  ELSE
    RAISE EXCEPTION 'permission denied for role %', p_role;
  END IF;

  IF p_role NOT IN ('agency_admin','business_manager','business_staff') THEN
    RAISE EXCEPTION 'invalid role: %', p_role;
  END IF;
  IF p_role <> 'agency_admin' AND p_business_id IS NULL THEN
    RAISE EXCEPTION 'business_id required for role %', p_role;
  END IF;
  IF length(p_password) < 8 THEN
    RAISE EXCEPTION 'password must be at least 8 characters';
  END IF;

  v_pw_hash := extensions.crypt(p_password, extensions.gen_salt('bf'));

  SELECT u.id INTO v_uid FROM auth.users u WHERE lower(u.email::text) = v_email;

  IF v_uid IS NULL THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    )
    VALUES (
      gen_random_uuid(),
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      v_email,
      v_pw_hash,
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', COALESCE(p_full_name, '')),
      now(), now()
    )
    RETURNING id INTO v_uid;
    v_created := true;
  ELSE
    UPDATE auth.users u
       SET encrypted_password = v_pw_hash,
           email_confirmed_at = COALESCE(u.email_confirmed_at, now()),
           updated_at         = now(),
           raw_user_meta_data = COALESCE(u.raw_user_meta_data, '{}'::jsonb)
              || jsonb_build_object('full_name',
                   COALESCE(NULLIF(p_full_name, ''),
                            u.raw_user_meta_data->>'full_name', ''))
     WHERE u.id = v_uid;
  END IF;

  INSERT INTO public.profiles (id, full_name, email)
  VALUES (v_uid, COALESCE(p_full_name, ''), v_email)
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), profiles.full_name);

  DELETE FROM public.business_users bu
   WHERE bu.user_id = v_uid
     AND COALESCE(bu.business_id, '00000000-0000-0000-0000-000000000000'::uuid)
       = COALESCE(p_business_id, '00000000-0000-0000-0000-000000000000'::uuid);

  INSERT INTO public.business_users (user_id, business_id, role)
  VALUES (v_uid, p_business_id, p_role);

  user_id := v_uid;
  created_new := v_created;
  RETURN NEXT;
END; $$;

GRANT EXECUTE ON FUNCTION public.admin_provision_account(text, text, text, uuid, text) TO authenticated;


-- ---------------------------------------------------------------------
-- 2a. revealed_at — server-side "has this member seen their gift popup"
-- ---------------------------------------------------------------------
ALTER TABLE public.customer_saved_offers
  ADD COLUMN IF NOT EXISTS revealed_at timestamptz;

-- Existing saved gifts predate the reveal feature — mark them revealed
-- so long-time members don't suddenly get a welcome popup replay.
UPDATE public.customer_saved_offers cso
   SET revealed_at = COALESCE(cso.revealed_at, cso.saved_at)
  FROM public.offers o
 WHERE o.id = cso.offer_id
   AND o.welcome_config_id IS NOT NULL
   AND cso.revealed_at IS NULL
   AND cso.saved_at < now() - interval '1 hour';


-- ---------------------------------------------------------------------
-- 2b. my_unrevealed_welcome_gift(p_business_id)
-- ---------------------------------------------------------------------
-- Returns the caller's own welcome gift that hasn't been revealed yet
-- (newest first, max 1). SECURITY DEFINER; membership resolved from
-- auth.uid() so it can only ever return the caller's row.
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
     AND cso.revealed_at IS NULL
     AND cso.fulfilled_at IS NULL
     AND o.welcome_config_id IS NOT NULL
     AND o.is_active
     AND (o.expires_at IS NULL OR o.expires_at > now())
   ORDER BY cso.saved_at DESC
   LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.my_unrevealed_welcome_gift(uuid) TO authenticated;


-- ---------------------------------------------------------------------
-- 2c. mark_welcome_gift_revealed(p_saved_id)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.mark_welcome_gift_revealed(uuid);

CREATE OR REPLACE FUNCTION public.mark_welcome_gift_revealed(p_saved_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n int;
BEGIN
  UPDATE public.customer_saved_offers cso
     SET revealed_at = now()
    FROM public.business_memberships m
   WHERE cso.id = p_saved_id
     AND m.id = cso.membership_id
     AND m.user_id = auth.uid()      -- caller-owned rows only
     AND cso.revealed_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n > 0;
END; $$;
GRANT EXECUTE ON FUNCTION public.mark_welcome_gift_revealed(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
