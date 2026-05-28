-- =====================================================================
-- CHECKPOINT 34 — Membership payment modes (Stripe / External link / In-person)
-- =====================================================================
-- Andrew's call: local business owners use wildly different payment
-- stacks (Square, PayPal, POS systems, cash). Forcing Stripe Connect is
-- friction. CP-34 gives each business owner three choices for how
-- customers pay for the premium membership:
--
--   1. stripe         — built-in Stripe Checkout (existing flow, CP-23)
--   2. external_link  — paste any payment URL; customer pays there, staff activates
--   3. in_person      — no online payment; staff activates at the front desk
--
-- For modes 2 and 3 the customer's membership lands in a 'pending'
-- state until staff activates them via activate_pending_membership.
--
-- Self-contained, idempotent. Apply after cp32.
-- =====================================================================


-- =====================================================================
-- 1. SCHEMA — extend business_membership_billing
-- =====================================================================

alter table public.business_membership_billing
  add column if not exists payment_mode         text not null default 'in_person'
    check (payment_mode in ('stripe','external_link','in_person')),
  add column if not exists external_payment_url text,
  add column if not exists payment_instructions text;

-- Backfill: businesses that have a Stripe key configured default to 'stripe',
-- otherwise stay on 'in_person'. Safe to re-run.
update public.business_membership_billing
   set payment_mode = 'stripe'
 where stripe_secret_key is not null
   and payment_mode = 'in_person';


-- Add a pending status to business_memberships if not already there.
-- The existing schema uses (active, paused, canceled). We add 'pending'
-- for the "joined but not yet paid" state.
do $$
begin
  alter table public.business_memberships
    drop constraint if exists business_memberships_status_check;
  alter table public.business_memberships
    add constraint business_memberships_status_check
      check (status in ('active','paused','canceled','pending'));
exception when undefined_table then null;
end $$;

-- Convenience flag on the membership row so the customer app can show
-- a "pending" badge without joining to the billing table every time.
alter table public.business_memberships
  add column if not exists membership_payment_status text
    check (membership_payment_status in ('paid','pending','unpaid'))
    default 'unpaid';


-- =====================================================================
-- 2. RPC — refresh membership_billing_public to expose payment_mode
-- =====================================================================
drop function if exists public.membership_billing_public(uuid);
create function public.membership_billing_public(p_business_id uuid)
returns table (
  is_enabled                 boolean,
  price_cents                int,
  membership_name            text,
  perks                      text[],
  monthly_cash_balance_cents int,
  points_multiplier          numeric,
  has_priority_booking       boolean,
  image_url                  text,
  payment_mode               text,
  external_payment_url       text,
  payment_instructions       text
)
language sql stable security definer set search_path = public as $$
  select b.is_enabled, b.price_cents, b.membership_name, b.perks,
         b.monthly_cash_balance_cents, b.points_multiplier,
         b.has_priority_booking, b.image_url,
         b.payment_mode, b.external_payment_url, b.payment_instructions
    from public.business_membership_billing b
   where b.business_id = p_business_id;
$$;
grant execute on function public.membership_billing_public(uuid) to anon, authenticated;


-- =====================================================================
-- 3. RPC — agency-side upsert (extended with the new fields)
-- =====================================================================
drop function if exists public.upsert_membership_billing_v2(
  uuid, boolean, text, int, text[], int, numeric, boolean, text, text, text, text
);

create function public.upsert_membership_billing_v2(
  p_business_id                 uuid,
  p_is_enabled                  boolean,
  p_membership_name             text,
  p_price_cents                 int,
  p_perks                       text[],
  p_monthly_cash_balance_cents  int,
  p_points_multiplier           numeric,
  p_has_priority_booking        boolean,
  p_image_url                   text,
  p_payment_mode                text default 'in_person',
  p_external_payment_url        text default null,
  p_payment_instructions        text default null
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_business_manager(p_business_id) and not public.is_agency_admin() then
    raise exception 'permission denied — manager or agency admin only';
  end if;
  if p_payment_mode not in ('stripe','external_link','in_person') then
    raise exception 'invalid payment_mode: %', p_payment_mode;
  end if;

  insert into public.business_membership_billing as b (
    business_id, is_enabled, membership_name, price_cents, perks,
    monthly_cash_balance_cents, points_multiplier, has_priority_booking,
    image_url, payment_mode, external_payment_url, payment_instructions
  )
  values (
    p_business_id, p_is_enabled, p_membership_name, p_price_cents, p_perks,
    p_monthly_cash_balance_cents, p_points_multiplier, p_has_priority_booking,
    p_image_url, p_payment_mode, p_external_payment_url, p_payment_instructions
  )
  on conflict (business_id) do update
     set is_enabled                 = excluded.is_enabled,
         membership_name            = excluded.membership_name,
         price_cents                = excluded.price_cents,
         perks                      = excluded.perks,
         monthly_cash_balance_cents = excluded.monthly_cash_balance_cents,
         points_multiplier          = excluded.points_multiplier,
         has_priority_booking       = excluded.has_priority_booking,
         image_url                  = excluded.image_url,
         payment_mode               = excluded.payment_mode,
         external_payment_url       = excluded.external_payment_url,
         payment_instructions       = excluded.payment_instructions,
         updated_at                 = now();
end; $$;
grant execute on function public.upsert_membership_billing_v2(
  uuid, boolean, text, int, text[], int, numeric, boolean, text, text, text, text
) to authenticated;


-- =====================================================================
-- 4. RPC — customer-side request_membership
-- ---------------------------------------------------------------------
-- Called when the customer taps "Join Membership" in external_link or
-- in_person mode. Marks their membership as pending and returns the
-- payment URL (if any) for the client to open.
-- =====================================================================
create or replace function public.request_membership(p_business_id uuid)
returns table (status text, payment_mode text, payment_url text)
language plpgsql security definer set search_path = public as $$
declare
  v_mode    text;
  v_url     text;
  v_user    uuid := auth.uid();
  v_mem_id  uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select b.payment_mode, b.external_payment_url
    into v_mode, v_url
    from public.business_membership_billing b
   where b.business_id = p_business_id;

  if v_mode is null then
    raise exception 'membership billing not configured for this business';
  end if;
  if v_mode = 'stripe' then
    raise exception 'this business is configured for Stripe — use /api/<slug>/membership/checkout instead';
  end if;

  -- Find or create the membership row.
  select id into v_mem_id
    from public.business_memberships
   where business_id = p_business_id and user_id = v_user;

  if v_mem_id is null then
    insert into public.business_memberships
      (business_id, user_id, status, membership_payment_status)
    values
      (p_business_id, v_user, 'pending', 'pending')
    returning id into v_mem_id;
  else
    update public.business_memberships
       set status                    = 'pending',
           membership_payment_status = 'pending'
     where id = v_mem_id;
  end if;

  return query select 'pending'::text, v_mode, v_url;
end; $$;
grant execute on function public.request_membership(uuid) to authenticated;


-- =====================================================================
-- 5. RPC — staff-side list of pending memberships at the front desk
-- =====================================================================
create or replace function public.list_pending_memberships(p_business_id uuid)
returns table (
  membership_id  uuid,
  user_id        uuid,
  full_name      text,
  email          text,
  phone          text,
  requested_at   timestamptz
)
language sql stable security definer set search_path = public as $$
  select m.id, m.user_id,
         coalesce(p.full_name, split_part(p.email::text, '@', 1)),
         p.email::text,
         p.phone::text,
         m.created_at
    from public.business_memberships m
    join public.profiles p on p.id = m.user_id
   where m.business_id = p_business_id
     and m.membership_payment_status = 'pending'
     and public.staffs_business(p_business_id)
   order by m.created_at asc;
$$;
grant execute on function public.list_pending_memberships(uuid) to authenticated;


-- =====================================================================
-- 6. RPC — staff activates a pending membership (CP-34 core)
-- =====================================================================
create or replace function public.activate_pending_membership(
  p_membership_id uuid,
  p_note          text default null
)
returns table (membership_id uuid, status text)
language plpgsql security definer set search_path = public as $$
declare v_business uuid;
begin
  select bm.business_id into v_business
    from public.business_memberships bm
   where bm.id = p_membership_id;

  if v_business is null then raise exception 'membership not found'; end if;
  if not public.staffs_business(v_business) then
    raise exception 'permission denied — staff only';
  end if;

  update public.business_memberships
     set status                    = 'active',
         membership_payment_status = 'paid',
         updated_at                = now()
   where id = p_membership_id;

  -- Surface a notification to the customer that they're in.
  insert into public.notifications (user_id, business_id, kind, title, body, link_path)
  select m.user_id, m.business_id, 'generic',
         'You''re a member! 🎉',
         coalesce(p_note,
           'Your membership is active. Tap to see your perks.'),
         '/app'
    from public.business_memberships m
   where m.id = p_membership_id;

  return query select p_membership_id, 'active'::text;
end; $$;
grant execute on function public.activate_pending_membership(uuid, text) to authenticated;


-- =====================================================================
-- 7. RPC — staff cancels a pending membership (e.g. customer no-show)
-- =====================================================================
create or replace function public.reject_pending_membership(p_membership_id uuid)
returns table (membership_id uuid, status text)
language plpgsql security definer set search_path = public as $$
declare v_business uuid;
begin
  select bm.business_id into v_business
    from public.business_memberships bm
   where bm.id = p_membership_id;

  if v_business is null then raise exception 'membership not found'; end if;
  if not public.staffs_business(v_business) then
    raise exception 'permission denied — staff only';
  end if;

  update public.business_memberships
     set status                    = 'canceled',
         membership_payment_status = 'unpaid',
         updated_at                = now()
   where id = p_membership_id;

  return query select p_membership_id, 'canceled'::text;
end; $$;
grant execute on function public.reject_pending_membership(uuid) to authenticated;


-- =====================================================================
-- CP-34 done. Apply after cp32.
-- =====================================================================
