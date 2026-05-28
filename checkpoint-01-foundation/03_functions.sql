-- =====================================================================
-- ATLAS REWARDS — CHECKPOINT 1: CORE FUNCTIONS
-- =====================================================================
-- Atomic, idempotent operations that the app/webhooks call.
-- These run as SECURITY DEFINER so they can update the points ledger
-- in a single transaction without RLS races.
-- Run AFTER 02_rls.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- award_points: atomic earn/spend with idempotency
-- ---------------------------------------------------------------------
-- Called by edge functions when a customer earns or redeems points.
-- The idempotency_key prevents double-awards when a webhook retries.
create or replace function public.award_points(
  p_membership_id  uuid,
  p_delta          integer,
  p_rule_type      text,
  p_reference_id   uuid default null,
  p_idempotency_key text default null,
  p_notes          text default null
)
returns table (ledger_id uuid, new_balance integer)
language plpgsql security definer set search_path = public as $$
declare
  v_business_id  uuid;
  v_new_balance  integer;
  v_ledger_id    uuid;
  v_existing_id  uuid;
begin
  -- Idempotency short-circuit
  if p_idempotency_key is not null then
    select id into v_existing_id from public.points_ledger where idempotency_key = p_idempotency_key;
    if v_existing_id is not null then
      return query
        select l.id, m.points_balance
          from public.points_ledger l
          join public.business_memberships m on m.id = l.membership_id
         where l.id = v_existing_id;
      return;
    end if;
  end if;

  -- Lock the membership row to serialize concurrent awards
  select business_id, points_balance + p_delta
    into v_business_id, v_new_balance
    from public.business_memberships
   where id = p_membership_id
   for update;

  if v_business_id is null then
    raise exception 'membership % not found', p_membership_id;
  end if;

  if v_new_balance < 0 then
    raise exception 'insufficient points (would go to %)', v_new_balance;
  end if;

  -- Update balance
  update public.business_memberships
     set points_balance = v_new_balance,
         lifetime_points_earned = lifetime_points_earned + greatest(p_delta, 0),
         updated_at = now()
   where id = p_membership_id;

  -- Write ledger
  insert into public.points_ledger
    (membership_id, business_id, delta, rule_type, reference_id, idempotency_key, balance_after, notes, created_by)
  values
    (p_membership_id, v_business_id, p_delta, p_rule_type, p_reference_id, p_idempotency_key, v_new_balance, p_notes, auth.uid())
  returning id into v_ledger_id;

  -- Recalculate tier if rules exist
  perform public.recalc_tier(p_membership_id);

  return query select v_ledger_id, v_new_balance;
end; $$;

-- ---------------------------------------------------------------------
-- recalc_tier: bumps a member's tier based on lifetime_points_earned
-- ---------------------------------------------------------------------
create or replace function public.recalc_tier(p_membership_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_business_id  uuid;
  v_lifetime     integer;
  v_tiers        jsonb;
  v_new_tier     text;
begin
  select business_id, lifetime_points_earned
    into v_business_id, v_lifetime
    from public.business_memberships where id = p_membership_id;

  select tiers into v_tiers from public.businesses where id = v_business_id;

  select tier->>'name' into v_new_tier
    from jsonb_array_elements(v_tiers) tier
   where (tier->>'min_points')::int <= v_lifetime
   order by (tier->>'min_points')::int desc
   limit 1;

  update public.business_memberships
     set tier = coalesce(v_new_tier, 'Bronze')
   where id = p_membership_id;
end; $$;

-- ---------------------------------------------------------------------
-- enroll_member: create a membership when a customer signs in to a business
-- ---------------------------------------------------------------------
-- Idempotent: if membership exists, return it; otherwise create it,
-- generate a referral code, and award the first_visit_bonus.
create or replace function public.enroll_member(
  p_user_id      uuid,
  p_business_id  uuid
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_membership_id  uuid;
  v_ref_code       text;
  v_bonus          integer;
begin
  select id into v_membership_id
    from public.business_memberships
   where user_id = p_user_id and business_id = p_business_id;

  if v_membership_id is not null then
    return v_membership_id;
  end if;

  -- Generate 6-char referral code, retrying on conflict
  loop
    v_ref_code := upper(substring(encode(gen_random_bytes(4),'hex') for 6));
    exit when not exists (select 1 from public.business_memberships where referral_code = v_ref_code);
  end loop;

  insert into public.business_memberships (user_id, business_id, referral_code)
       values (p_user_id, p_business_id, v_ref_code)
    returning id into v_membership_id;

  -- First-visit bonus from the business's point_rules
  select coalesce((point_rules->>'first_visit_bonus')::int, 0)
    into v_bonus from public.businesses where id = p_business_id;

  if v_bonus > 0 then
    perform public.award_points(
      v_membership_id, v_bonus, 'first_visit_bonus',
      null, 'first_visit_' || v_membership_id::text, 'Welcome bonus'
    );
  end if;

  return v_membership_id;
end; $$;

-- ---------------------------------------------------------------------
-- resolve_business_by_slug: client-side helper for subdomain routing
-- ---------------------------------------------------------------------
-- The PWA reads window.location.host → 'joesgym.atlasrewards.app'
-- → calls this with 'joesgym' to get the brand config + widget toggles.
create or replace function public.resolve_business_by_slug(p_slug text)
returns table (
  id uuid, slug citext, name text, industry text, logo_url text,
  brand_colors jsonb, welcome_message jsonb, widget_config jsonb,
  point_rules jsonb, tiers jsonb, contact_info jsonb, google_review_url text
)
language sql stable security definer set search_path = public as $$
  select id, slug, name, industry, logo_url, brand_colors,
         to_jsonb(welcome_message), widget_config, point_rules, tiers,
         contact_info, google_review_url
    from public.businesses
   where slug = p_slug and status = 'active';
$$;

-- Allow anon + authenticated to call resolve_business_by_slug
grant execute on function public.resolve_business_by_slug(text) to anon, authenticated;

-- award_points and enroll_member should be callable by authenticated users
grant execute on function public.award_points(uuid,integer,text,uuid,text,text) to authenticated;
grant execute on function public.enroll_member(uuid,uuid) to authenticated;
