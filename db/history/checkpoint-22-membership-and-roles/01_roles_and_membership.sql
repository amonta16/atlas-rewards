-- =====================================================================
-- CHECKPOINT 22 — Role gating + single-membership extension
-- =====================================================================
-- Two related changes in one paste-able migration:
--
-- A) ROLE GATING — add is_business_manager(b_id) and tighten the row-level
--    security on revenue / analytics tables so that 'business_staff' (front
--    desk) cannot fetch them, even via a direct API call. Belt-and-suspenders
--    with the UI gating that hides the Billing + Insights tabs.
--
-- B) SINGLE-MEMBERSHIP FIELDS — extend business_membership_billing with the
--    Dermis-style benefit fields the customer card needs (monthly cash
--    balance, points multiplier, priority booking flag, image), and update
--    membership_billing_public() to expose them safely (Stripe key still
--    stripped).
--
-- Safe to re-run. Uses IF NOT EXISTS / DROP+RECREATE patterns throughout.
-- =====================================================================

-- ===========================
-- A) ROLE GATING
-- ===========================

-- is_business_manager — true for agency_admin AND business_manager, false for
-- business_staff (front desk). Manager-only RPCs and policies use this so a
-- staffer's session cannot read revenue or PII even if the UI accidentally
-- shows them a button they shouldn't see.
create or replace function public.is_business_manager(b_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_agency_admin()
      or exists (
        select 1 from public.business_users
         where user_id = auth.uid()
           and business_id = b_id
           and role = 'business_manager'
      );
$$;

grant execute on function public.is_business_manager(uuid) to authenticated;

-- ----- A.1  business_membership_billing — manager-only RLS -----
-- The previous policy used staffs_business() which also matches business_staff.
-- Tighten so only business_manager / agency_admin can read or write Stripe
-- credentials, membership pricing, etc.
do $$ begin
  begin drop policy "membilling_staff"  on public.business_membership_billing; exception when undefined_object then null; end;
  begin drop policy "membilling_manager" on public.business_membership_billing; exception when undefined_object then null; end;
end $$;

create policy "membilling_manager" on public.business_membership_billing
  for all to authenticated
  using      (public.is_business_manager(business_id))
  with check (public.is_business_manager(business_id));

-- ----- A.2  business_analytics_rollup — manager-only RPC -----
-- Already defined in CP-20 with `where public.staffs_business(...)`. Replace
-- with the manager-only check so a staff session calling this RPC returns no
-- rows even if they manage to invoke it directly.
create or replace function public.business_analytics_rollup(p_business_id uuid)
returns table (
  total_members        int,
  new_members_30d      int,
  active_members_30d   int,
  repeat_rate_pct      numeric,
  avg_value_cents      numeric,
  redemptions_30d      int,
  points_awarded_30d   bigint,
  redemption_rate_pct  numeric,
  inactive_60d         int,
  total_revenue_30d_cents bigint
)
language sql stable security definer set search_path = public as $$
  with members as (
    select id, user_id, joined_at,
           (select count(*) from public.check_in_events e
             where e.business_id = p_business_id and e.membership_id = m.id) as visit_count,
           (select max(e.created_at) from public.check_in_events e
             where e.business_id = p_business_id and e.membership_id = m.id) as last_visit_at
      from public.business_memberships m
     where m.business_id = p_business_id
  ),
  ledger_30 as (
    select * from public.points_ledger
     where business_id = p_business_id
       and created_at >= now() - interval '30 days'
  ),
  events_30 as (
    select * from public.events
     where business_id = p_business_id
       and event_type = 'purchase'
       and amount_cents is not null
       and created_at >= now() - interval '30 days'
  )
  select
    (select count(*) from members)::int,
    (select count(*) from members where joined_at >= now() - interval '30 days')::int,
    (select count(*) from members where last_visit_at >= now() - interval '30 days')::int,
    case when (select count(*) from members) > 0
         then ((select count(*) from members where visit_count >= 2)::numeric
               / nullif((select count(*) from members), 0) * 100)::numeric(10,1)
         else 0 end,
    (select coalesce(avg(amount_cents), 0)::numeric(10,0) from events_30),
    (select count(*)::int from public.redemptions
      where business_id = p_business_id
        and created_at >= now() - interval '30 days'),
    (select coalesce(sum(delta), 0)::bigint from ledger_30 where delta > 0),
    case when (select sum(delta) from ledger_30 where delta > 0) > 0
         then (
           (select abs(coalesce(sum(delta), 0))::numeric from ledger_30 where delta < 0)
           / nullif((select sum(delta) from ledger_30 where delta > 0)::numeric, 0)
           * 100
         )::numeric(10,1)
         else 0 end,
    (select count(*)::int from members where last_visit_at < now() - interval '60 days'
       or last_visit_at is null),
    (select coalesce(sum(amount_cents), 0)::bigint from events_30)
  where public.is_business_manager(p_business_id);   -- ← was staffs_business
$$;

grant execute on function public.business_analytics_rollup(uuid) to authenticated;

-- ----- A.3  current_app_role(b_id) — helper for the client to know which role it has -----
-- Cheap RPC the client calls once on mount to decide which sidebar/tabs to
-- render. UI uses this for show/hide; RLS is still the source of truth.
create or replace function public.current_app_role(p_business_id uuid)
returns text
language sql stable security definer set search_path = public as $$
  select case
    when public.is_agency_admin()                       then 'agency_admin'
    when public.is_business_manager(p_business_id)      then 'business_manager'
    when public.staffs_business(p_business_id)          then 'business_staff'
    else 'customer'
  end;
$$;
grant execute on function public.current_app_role(uuid) to authenticated;


-- ===========================
-- B) SINGLE-MEMBERSHIP FIELDS
-- ===========================

-- Extend business_membership_billing with the Dermis-style benefit fields
-- the customer card surfaces. All optional / defaulted so existing rows
-- keep working without backfill.
alter table public.business_membership_billing
  add column if not exists monthly_cash_balance_cents int     not null default 0,
  add column if not exists points_multiplier          numeric not null default 1.0,
  add column if not exists has_priority_booking       boolean not null default false,
  add column if not exists image_url                  text;

-- Update the public read RPC to expose the new fields (still strips the
-- Stripe secret key — that's manager-only via RLS).
create or replace function public.membership_billing_public(p_business_id uuid)
returns table (
  is_enabled                 boolean,
  price_cents                int,
  membership_name            text,
  perks                      text[],
  monthly_cash_balance_cents int,
  points_multiplier          numeric,
  has_priority_booking       boolean,
  image_url                  text
)
language sql stable security definer set search_path = public as $$
  select is_enabled, price_cents, membership_name, perks,
         monthly_cash_balance_cents, points_multiplier,
         has_priority_booking, image_url
    from public.business_membership_billing
   where business_id = p_business_id;
$$;

grant execute on function public.membership_billing_public(uuid) to anon, authenticated;

-- Storage bucket for membership images (idempotent — safe if already present).
insert into storage.buckets (id, name, public)
values ('membership-images', 'membership-images', true)
on conflict (id) do nothing;

-- Manager-side upsert RPC. Saves all the new fields in one call so the
-- single-membership form can stay simple on the client.
drop function if exists public.upsert_membership_billing(
  uuid, boolean, text, int, text[], int, numeric, boolean, text
);

create or replace function public.upsert_membership_billing(
  p_business_id                 uuid,
  p_is_enabled                  boolean,
  p_membership_name             text,
  p_price_cents                 int,
  p_perks                       text[],
  p_monthly_cash_balance_cents  int,
  p_points_multiplier           numeric,
  p_has_priority_booking        boolean,
  p_image_url                   text
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_business_manager(p_business_id) then
    raise exception 'permission denied: business_manager required';
  end if;

  insert into public.business_membership_billing
    (business_id, is_enabled, membership_name, price_cents, perks,
     monthly_cash_balance_cents, points_multiplier, has_priority_booking, image_url, updated_at)
  values
    (p_business_id, p_is_enabled, p_membership_name, p_price_cents, p_perks,
     p_monthly_cash_balance_cents, p_points_multiplier, p_has_priority_booking, p_image_url, now())
  on conflict (business_id) do update set
    is_enabled                 = excluded.is_enabled,
    membership_name            = excluded.membership_name,
    price_cents                = excluded.price_cents,
    perks                      = excluded.perks,
    monthly_cash_balance_cents = excluded.monthly_cash_balance_cents,
    points_multiplier          = excluded.points_multiplier,
    has_priority_booking       = excluded.has_priority_booking,
    image_url                  = excluded.image_url,
    updated_at                 = now();
end;
$$;

grant execute on function public.upsert_membership_billing(
  uuid, boolean, text, int, text[], int, numeric, boolean, text
) to authenticated;

-- ----- Reload PostgREST so the new RPC signatures are visible immediately -----
notify pgrst, 'reload schema';
