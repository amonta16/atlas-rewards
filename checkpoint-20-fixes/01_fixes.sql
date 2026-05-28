-- =====================================================================
-- CHECKPOINT 20 — Consolidated fix migration
-- =====================================================================
-- Patches several issues surfaced while applying CP-17/CP-18:
--
--   1. active_booking_tags signature change → must DROP first (PG won't
--      let you swap OUT-parameter types via CREATE OR REPLACE).
--   2. upsert_offer existed but wasn't visible to the API in PostgREST's
--      schema cache → DROP + recreate, then NOTIFY 'reload schema'.
--   3. business_analytics_rollup referenced points_ledger.amount_cents,
--      which doesn't exist on that table. Revenue + avg-value should come
--      from the events table (event_type='purchase', amount_cents column).
--
-- Safe to re-run. If you already ran CP-17 and CP-18 successfully you can
-- still run this — it'll just refresh the function bodies.
-- =====================================================================

-- ----- 1. active_booking_tags — drop + recreate -----
drop function if exists public.active_booking_tags(uuid);

create or replace function public.active_booking_tags(p_business_id uuid)
returns table (
  id uuid, name text, description text, emoji text,
  duration_minutes int, price_cents int, color text
)
language sql stable security definer set search_path = public as $$
  select id, name, description, emoji, duration_minutes, price_cents, color
    from public.booking_tags
   where business_id = p_business_id and is_active
   order by sort_order, created_at;
$$;
grant execute on function public.active_booking_tags(uuid) to anon, authenticated;

-- ----- 1b. Offers table — create if the CP-13 migration was skipped -----
-- Safe to run even if the table already exists (uses IF NOT EXISTS).
create table if not exists public.offers (
  id          uuid primary key default uuid_generate_v4(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  title       text not null,
  description text,
  image_url   text,
  starts_at   timestamptz default now(),
  expires_at  timestamptz,
  is_active   boolean not null default true,
  is_featured boolean not null default false,
  is_automated boolean not null default false,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.offers enable row level security;
do $$ begin
  begin drop policy "offers_staff_write"  on public.offers; exception when undefined_object then null; end;
  begin drop policy "offers_public_read"  on public.offers; exception when undefined_object then null; end;
end $$;
create policy "offers_staff_write" on public.offers for all to authenticated
  using  (public.staffs_business(business_id))
  with check (public.staffs_business(business_id));
create policy "offers_public_read" on public.offers for select to anon, authenticated
  using (is_active and (expires_at is null or expires_at > now()));

-- Storage bucket for offer images (safe no-op if already exists)
insert into storage.buckets (id, name, public) values ('offer-images', 'offer-images', true)
  on conflict (id) do nothing;

-- ----- 2. upsert_offer — drop + recreate so PostgREST sees it -----
drop function if exists public.upsert_offer(uuid, uuid, text, text, text, timestamptz, boolean, boolean);

create or replace function public.upsert_offer(
  p_id           uuid,
  p_business_id  uuid,
  p_title        text,
  p_description  text default null,
  p_image_url    text default null,
  p_expires_at   timestamptz default null,
  p_is_active    boolean default true,
  p_is_featured  boolean default false
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.staffs_business(p_business_id) then raise exception 'permission denied'; end if;

  -- Only one featured offer per business — un-feature others when this one is featured.
  if p_is_featured then
    update public.offers set is_featured = false where business_id = p_business_id and is_featured = true;
  end if;

  if p_id is null then
    insert into public.offers (business_id, title, description, image_url, expires_at, is_active, is_featured)
    values (p_business_id, p_title, p_description, p_image_url, p_expires_at, p_is_active, p_is_featured)
    returning id into v_id;
  else
    update public.offers
       set title = p_title, description = p_description, image_url = p_image_url,
           expires_at = p_expires_at, is_active = p_is_active, is_featured = p_is_featured,
           updated_at = now()
     where id = p_id and business_id = p_business_id
    returning id into v_id;
  end if;
  return v_id;
end; $$;
grant execute on function public.upsert_offer(uuid, uuid, text, text, text, timestamptz, boolean, boolean) to authenticated;

-- ----- 3. business_analytics_rollup — fix amount_cents + visit table -----
-- points_ledger has NO amount_cents column. Revenue + avg purchase value
-- live on the events table (event_type='purchase', amount_cents).
-- member_visit_events does not exist — visits are tracked in check_in_events
-- (added in CP-19); use created_at as the visit timestamp.
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
    (select count(*) from members)::int                                  as total_members,
    (select count(*) from members where joined_at >= now() - interval '30 days')::int as new_members_30d,
    (select count(*) from members where last_visit_at >= now() - interval '30 days')::int as active_members_30d,
    case when (select count(*) from members) > 0
         then ((select count(*) from members where visit_count >= 2)::numeric
               / nullif((select count(*) from members), 0) * 100)::numeric(10,1)
         else 0 end                                                       as repeat_rate_pct,
    (select coalesce(avg(amount_cents), 0)::numeric(10,0) from events_30)  as avg_value_cents,
    (select count(*)::int from public.redemptions
      where business_id = p_business_id
        and created_at >= now() - interval '30 days')                     as redemptions_30d,
    (select coalesce(sum(delta), 0)::bigint from ledger_30 where delta > 0) as points_awarded_30d,
    case when (select sum(delta) from ledger_30 where delta > 0) > 0
         then (
           (select abs(coalesce(sum(delta), 0))::numeric from ledger_30 where delta < 0)
           / nullif((select sum(delta) from ledger_30 where delta > 0)::numeric, 0)
           * 100
         )::numeric(10,1)
         else 0 end                                                       as redemption_rate_pct,
    (select count(*)::int from members where last_visit_at < now() - interval '60 days'
       or last_visit_at is null)                                          as inactive_60d,
    (select coalesce(sum(amount_cents), 0)::bigint from events_30)        as total_revenue_30d_cents
  where public.staffs_business(p_business_id);
$$;
grant execute on function public.business_analytics_rollup(uuid) to authenticated;

-- ----- 4. Automated-offer priority in featured_offer() -----
-- Add an is_automated flag so the scheduler can mark its rows and
-- featured_offer() can always surface automated offers above manual ones.
alter table public.offers
  add column if not exists is_automated boolean not null default false;

-- Refresh trigger_automated_offers so new inserts carry is_automated = true.
create or replace function public.trigger_automated_offers()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_row         record;
  v_today       date := current_date;
  v_month       int  := extract(month from v_today)::int;
  v_day         int  := extract(day from v_today)::int;
  v_window      int;
  v_diff        int;
  v_count       int  := 0;
  v_expires_at  timestamptz;
begin
  for v_row in
    select o.id as config_id, o.business_id,
           o.custom_title, o.custom_description,
           o.custom_image_url, o.discount_type, o.discount_value, o.expires_after_days,
           o.last_triggered_at,
           t.slug, t.name, t.emoji, t.trigger_type, t.trigger_config
      from public.business_automated_offers o
      join public.automated_offer_templates t on t.id = o.template_id
     where o.is_active and t.trigger_type = 'date'
  loop
    v_window := coalesce((v_row.trigger_config->>'window_days')::int, 0);
    v_diff := abs(v_today - make_date(
      extract(year from v_today)::int,
      (v_row.trigger_config->>'month')::int,
      (v_row.trigger_config->>'day')::int));
    if v_diff <= v_window then
      if v_row.last_triggered_at is null
         or v_row.last_triggered_at < (now() - interval '30 days') then
        v_expires_at := now() + (coalesce(v_row.expires_after_days, 7) || ' days')::interval;
        insert into public.offers
          (business_id, title, description, image_url,
           expires_at, is_active, is_featured, is_automated)
        values
          (v_row.business_id,
           coalesce(v_row.custom_title, v_row.emoji || ' ' || v_row.name),
           v_row.custom_description,
           v_row.custom_image_url,
           v_expires_at,
           true,
           true,
           true)   -- ← mark as automated so it gets priority in featured_offer()
        on conflict do nothing;

        update public.business_automated_offers
           set last_triggered_at = now()
         where id = v_row.config_id;
        v_count := v_count + 1;
      end if;
    end if;
  end loop;
  return v_count;
end; $$;
grant execute on function public.trigger_automated_offers() to service_role;

-- Update featured_offer() to give automated offers priority over one-time ones.
create or replace function public.featured_offer(p_business_id uuid)
returns table (id uuid, title text, description text, image_url text, expires_at timestamptz)
language sql stable security definer set search_path = public as $$
  select o.id, o.title, o.description, o.image_url, o.expires_at
    from public.offers o
   where o.business_id = p_business_id
     and o.is_active
     and o.is_featured
     and (o.expires_at is null or o.expires_at > now())
   order by o.is_automated desc,  -- automated always beats manual
            o.sort_order,
            o.created_at desc
   limit 1;
$$;
grant execute on function public.featured_offer(uuid) to anon, authenticated;

-- ----- 5. Business membership billing config -----
-- Stores the Stripe credentials + price that the manager configures so
-- customers can subscribe to a paid membership.
-- The stripe_secret_key is only readable by staff (RLS). Customers call
-- membership_billing_public() which strips out all sensitive fields.
create table if not exists public.business_membership_billing (
  business_id           uuid primary key references public.businesses(id) on delete cascade,
  is_enabled            boolean not null default false,
  membership_name       text    not null default 'VIP Membership',
  price_cents           int     not null default 999,
  perks                 text[]  not null default '{}',
  stripe_secret_key     text,                          -- manager's Stripe sk_live_... / sk_test_...
  stripe_webhook_secret text,                          -- whsec_... from Stripe dashboard
  connected_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
alter table public.business_membership_billing enable row level security;
do $$ begin
  begin drop policy "membilling_staff" on public.business_membership_billing; exception when undefined_object then null; end;
end $$;
create policy "membilling_staff" on public.business_membership_billing
  for all to authenticated
  using  (public.staffs_business(business_id))
  with check (public.staffs_business(business_id));

-- Safe public read — never exposes the Stripe key.
create or replace function public.membership_billing_public(p_business_id uuid)
returns table (
  is_enabled      boolean,
  price_cents     int,
  membership_name text,
  perks           text[]
)
language sql stable security definer set search_path = public as $$
  select is_enabled, price_cents, membership_name, perks
  from public.business_membership_billing
  where business_id = p_business_id;
$$;
grant execute on function public.membership_billing_public(uuid) to anon, authenticated;

-- Called by the membership webhook after successful Stripe payment to upgrade
-- the customer's tier to the paid membership.
create or replace function public.upgrade_to_member(
  p_business_id  uuid,
  p_user_id      uuid,
  p_tier_name    text default 'Member'
)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.business_memberships
  set tier = p_tier_name, updated_at = now()
  where business_id = p_business_id
    and user_id = p_user_id;
end; $$;
grant execute on function public.upgrade_to_member(uuid, uuid, text) to service_role;

-- ----- 7. Tell PostgREST to reload the schema cache -----
notify pgrst, 'reload schema';
