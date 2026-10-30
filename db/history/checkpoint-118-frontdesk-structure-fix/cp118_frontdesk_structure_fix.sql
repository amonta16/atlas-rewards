-- =====================================================================
-- Atlas · CP-118 v2 — front-desk lookup HOTFIX #2 (P0)
-- "structure of query does not match function result type"
-- =====================================================================
-- SYMPTOM: typing a member code or scanning a QR at the front desk shows
--   "Couldn't look up that code — structure of query does not match
--    function result type"
--
-- ROOT CAUSE: profiles.email is CITEXT (checkpoint-01 schema), but
-- resolve_member_by_code declares `email text` in RETURNS TABLE. The
-- pre-CP-110 resolver was LANGUAGE SQL, which applies the implicit
-- citext->text coercion at creation time, so it worked. CP-110 rewrote
-- it as LANGUAGE PLPGSQL with RETURN QUERY — and plpgsql's row
-- conversion requires the query's column types to match the declared
-- types EXACTLY (no implicit coercion), so every call raises this error.
-- CP-117 kept the plpgsql shape and inherited it.
--
-- FIX: recreate all three desk lookup resolvers as LANGUAGE SQL with an
-- EXPLICIT cast on EVERY output column — immune to citext/enum/type
-- drift. PII gate kept, inline against business_users: a non-staff
-- caller gets zero rows, never an error.
--
-- v2: each resolver is DROPPED first. CREATE OR REPLACE cannot change a
-- function's return column list (error 42P13), and the live
-- resolve_redemption_by_code carries CP-44's reward_image_url column —
-- v1 omitted both the drop and that column, so it failed with 42P13 and
-- rolled back. v2 drops first and keeps the CP-44 column so the desk's
-- fulfillment screen still shows the reward photo.
--
-- Safe to run on production and safe to re-run. No data is touched.
-- =====================================================================

begin;

-- ── 0. keep the helper chain healthy (same as CP-117, idempotent) ────
create or replace function public.is_agency_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.business_users
     where user_id = auth.uid() and role = 'agency_admin'
  );
$$;
grant execute on function public.is_agency_admin() to authenticated;

create or replace function public.is_agency_va()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.business_users
     where user_id = auth.uid() and role = 'agency_va'
  );
$$;
grant execute on function public.is_agency_va() to authenticated;

create or replace function public.staffs_business(b_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.business_users
     where user_id = auth.uid() and business_id = b_id
  ) or public.is_agency_admin()
    or public.is_agency_va();
$$;
grant execute on function public.staffs_business(uuid) to authenticated;

-- ── 1. member lookup (the RPC that is erroring right now) ────────────
drop function if exists public.resolve_member_by_code(text, uuid);
create function public.resolve_member_by_code(p_code text, p_business_id uuid)
returns table (
  membership_id uuid, user_id uuid, full_name text, email text, phone text,
  points_balance integer, tier text, joined_at timestamptz, visit_count integer
)
language sql stable security definer set search_path = public as $$
  select m.id::uuid,
         m.user_id::uuid,
         p.full_name::text,
         p.email::text,          -- citext on live: the cast is the fix
         p.phone::text,
         m.points_balance::integer,
         m.tier::text,
         m.joined_at::timestamptz,
         m.visit_count::integer
    from public.business_memberships m
    join public.profiles p on p.id = m.user_id
   where m.referral_code = p_code
     and m.business_id = p_business_id
     and exists (
       select 1 from public.business_users bu
        where bu.user_id = auth.uid()
          and (bu.business_id = p_business_id
               or (bu.business_id is null and bu.role in ('agency_admin','agency_va')))
     )
   limit 1;
$$;
grant execute on function public.resolve_member_by_code(text, uuid) to authenticated;

-- ── 2. redemption lookup — CP-44 shape (WITH reward_image_url) ───────
drop function if exists public.resolve_redemption_by_code(text, uuid);
create function public.resolve_redemption_by_code(p_code text, p_business_id uuid)
returns table (
  redemption_id uuid, reward_id uuid, membership_id uuid,
  reward_name text, reward_description text, reward_type text,
  reward_image_url text,
  point_cost integer, status text, code text,
  member_name text, member_email text,
  created_at timestamptz, expires_at timestamptz, fulfilled_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select r.id::uuid, r.reward_id::uuid, r.membership_id::uuid,
         rw.name::text, rw.description::text, rw.reward_type::text,
         rw.image_url::text,
         r.point_cost::integer, r.status::text, r.code::text,
         p.full_name::text, p.email::text,
         r.created_at::timestamptz, r.expires_at::timestamptz, r.fulfilled_at::timestamptz
    from public.redemptions r
    join public.rewards rw             on rw.id = r.reward_id
    join public.business_memberships m on m.id = r.membership_id
    join public.profiles p             on p.id = m.user_id
   where r.code = upper(p_code)
     and r.business_id = p_business_id
     and exists (
       select 1 from public.business_users bu
        where bu.user_id = auth.uid()
          and (bu.business_id = p_business_id
               or (bu.business_id is null and bu.role in ('agency_admin','agency_va')))
     )
   limit 1;
$$;
grant execute on function public.resolve_redemption_by_code(text, uuid) to authenticated;

-- ── 3. saved-gift lookup (CP-36 shape, same hardening) ───────────────
drop function if exists public.resolve_saved_offer_by_code(text, uuid);
create function public.resolve_saved_offer_by_code(p_code text, p_business_id uuid)
returns table (
  saved_id uuid, membership_id uuid, full_name text, email text,
  offer_id uuid, title text, description text, image_url text,
  discount_type text, discount_value int,
  expires_at timestamptz, fulfilled_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select c.id::uuid, c.membership_id::uuid, p.full_name::text, p.email::text,
         o.id::uuid, o.title::text, o.description::text, o.image_url::text,
         o.discount_type::text, o.discount_value::integer,
         o.expires_at::timestamptz, c.fulfilled_at::timestamptz
    from public.customer_saved_offers c
    join public.offers o               on o.id = c.offer_id
    join public.business_memberships m on m.id = c.membership_id
    left join public.profiles p        on p.id = m.user_id
   where c.business_id = p_business_id
     and c.redeem_code = upper(btrim(p_code))
     and exists (
       select 1 from public.business_users bu
        where bu.user_id = auth.uid()
          and (bu.business_id = p_business_id
               or (bu.business_id is null and bu.role in ('agency_admin','agency_va')))
     );
$$;
grant execute on function public.resolve_saved_offer_by_code(text, uuid) to authenticated;

commit;

-- Tell PostgREST (Supabase's API layer) to pick up the recreated
-- functions immediately — dropped/recreated RPCs otherwise 404 until
-- its schema cache refreshes.
notify pgrst, 'reload schema';

-- =====================================================================
-- After applying: at the desk, scan a member QR or type a 6-char code →
-- the member profile loads. No app deploy is needed — the client code
-- from CP-117 is already correct; only the SQL was broken.
-- =====================================================================
