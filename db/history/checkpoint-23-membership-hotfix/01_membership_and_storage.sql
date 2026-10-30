-- =====================================================================
-- CHECKPOINT 23 — Self-contained membership + storage hotfix
-- =====================================================================
-- Three things in one paste:
--
--   1. business_membership_billing TABLE — CP-22 assumed CP-20 had already
--      created it. If you got "ERROR: 42P01: relation does not exist", this
--      file is the fix. Idempotent CREATE TABLE IF NOT EXISTS + every column
--      the CP-22 code needs.
--
--   2. upsert_membership_billing() RPC + RLS — the Brand Editor calls this
--      when you Save. After this migration runs and PostgREST reloads its
--      schema cache (handled at the bottom), the save button will work.
--
--   3. STORAGE POLICIES for the membership-images and offer-images buckets
--      — "new row violates row-level security policy" on image upload means
--      the bucket exists but storage.objects has no INSERT policy for it.
--      Fixes both image upload paths.
--
-- Safe to re-run. Builds on (and is a hotfix for) CP-22, but does not
-- require CP-22 to have completed successfully.
-- =====================================================================

-- ----- 1.  business_membership_billing — create or extend -----
create table if not exists public.business_membership_billing (
  business_id           uuid primary key references public.businesses(id) on delete cascade,
  is_enabled            boolean not null default false,
  membership_name       text    not null default 'VIP Membership',
  price_cents           int     not null default 999,
  perks                 text[]  not null default '{}',
  stripe_secret_key     text,
  stripe_webhook_secret text,
  connected_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- CP-22 columns — added defensively in case the table already existed before
-- CP-22 (and again here, in case CP-22 partially ran).
alter table public.business_membership_billing
  add column if not exists monthly_cash_balance_cents int     not null default 0,
  add column if not exists points_multiplier          numeric not null default 1.0,
  add column if not exists has_priority_booking       boolean not null default false,
  add column if not exists image_url                  text;

alter table public.business_membership_billing enable row level security;

-- Drop both possible historical policy names so we can recreate cleanly.
do $$ begin
  begin drop policy "membilling_staff"   on public.business_membership_billing; exception when undefined_object then null; end;
  begin drop policy "membilling_manager" on public.business_membership_billing; exception when undefined_object then null; end;
end $$;

-- Manager-only RLS — front desk (business_staff) cannot read or write Stripe
-- credentials or membership pricing. is_business_manager() must already exist
-- from CP-22; if you skipped CP-22 entirely, define it inline as a fallback.
do $$ begin
  if not exists (select 1 from pg_proc where proname = 'is_business_manager') then
    execute $is_mgr$
      create or replace function public.is_business_manager(b_id uuid)
      returns boolean
      language sql stable security definer set search_path = public
      as $body$
        select public.is_agency_admin()
            or exists (
              select 1 from public.business_users
               where user_id = auth.uid()
                 and business_id = b_id
                 and role = 'business_manager'
            );
      $body$;
      grant execute on function public.is_business_manager(uuid) to authenticated;
    $is_mgr$;
  end if;
end $$;

-- Same fallback for current_app_role — the manager dashboard calls it.
do $$ begin
  if not exists (select 1 from pg_proc where proname = 'current_app_role') then
    execute $cur_role$
      create or replace function public.current_app_role(p_business_id uuid)
      returns text
      language sql stable security definer set search_path = public
      as $body$
        select case
          when public.is_agency_admin()                       then 'agency_admin'
          when public.is_business_manager(p_business_id)      then 'business_manager'
          when public.staffs_business(p_business_id)          then 'business_staff'
          else 'customer'
        end;
      $body$;
      grant execute on function public.current_app_role(uuid) to authenticated;
    $cur_role$;
  end if;
end $$;

create policy "membilling_manager" on public.business_membership_billing
  for all to authenticated
  using      (public.is_business_manager(business_id))
  with check (public.is_business_manager(business_id));

-- ----- 2.  membership_billing_public — customer-safe projection -----
-- Strips the Stripe key. Exposes only the fields the customer card needs.
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

-- ----- 3.  upsert_membership_billing — used by the agency Brand Editor -----
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

-- ===========================
--  STORAGE — buckets + policies
-- ===========================
-- The buckets themselves are created on previous migrations, but storage.objects
-- has its OWN row-level security separate from `public.*` tables. Without an
-- INSERT policy here, the Atlas <ImageUploader> hits PostgREST 403:
--   "new row violates row-level security policy"
-- These policies grant authenticated staff INSERT/UPDATE/DELETE on the bucket,
-- and let anyone read (so the customer app can display the image).

insert into storage.buckets (id, name, public)
values ('membership-images', 'membership-images', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('offer-images', 'offer-images', true)
on conflict (id) do nothing;

-- Drop any stale policies under both possible historical names so re-runs
-- don't error with "policy already exists".
do $$ begin
  begin drop policy "membership_images_public_read"     on storage.objects; exception when undefined_object then null; end;
  begin drop policy "membership_images_auth_write"      on storage.objects; exception when undefined_object then null; end;
  begin drop policy "membership_images_auth_update"     on storage.objects; exception when undefined_object then null; end;
  begin drop policy "membership_images_auth_delete"     on storage.objects; exception when undefined_object then null; end;
  begin drop policy "offer_images_public_read"          on storage.objects; exception when undefined_object then null; end;
  begin drop policy "offer_images_auth_write"           on storage.objects; exception when undefined_object then null; end;
  begin drop policy "offer_images_auth_update"          on storage.objects; exception when undefined_object then null; end;
  begin drop policy "offer_images_auth_delete"          on storage.objects; exception when undefined_object then null; end;
end $$;

-- ----- membership-images -----
create policy "membership_images_public_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'membership-images');

create policy "membership_images_auth_write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'membership-images');

create policy "membership_images_auth_update" on storage.objects
  for update to authenticated
  using      (bucket_id = 'membership-images')
  with check (bucket_id = 'membership-images');

create policy "membership_images_auth_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'membership-images');

-- ----- offer-images -----
create policy "offer_images_public_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'offer-images');

create policy "offer_images_auth_write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'offer-images');

create policy "offer_images_auth_update" on storage.objects
  for update to authenticated
  using      (bucket_id = 'offer-images')
  with check (bucket_id = 'offer-images');

create policy "offer_images_auth_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'offer-images');

-- ===========================
--  EXTEND my_redemptions WITH REWARD IMAGE
-- ===========================
-- The customer's "Your active rewards" list shows the reward image now
-- (was just a generic gift icon). Extend the RPC's return signature so the
-- image URL comes back in the same round-trip — no extra fetch per row.
drop function if exists public.my_redemptions(uuid);

create or replace function public.my_redemptions(p_business_id uuid)
returns table (
  id            uuid,
  reward_id     uuid,
  reward_name   text,
  reward_type   text,
  reward_image  text,    -- ← new (CP-23)
  point_cost    integer,
  code          text,
  status        text,
  created_at    timestamptz,
  expires_at    timestamptz,
  fulfilled_at  timestamptz
)
language sql stable security definer set search_path = public as $$
  select r.id, r.reward_id, rw.name, rw.reward_type, rw.image_url,
         r.point_cost, r.code, r.status,
         r.created_at, r.expires_at, r.fulfilled_at
    from public.redemptions r
    join public.rewards rw on rw.id = r.reward_id
    join public.business_memberships m on m.id = r.membership_id
   where m.user_id = auth.uid()
     and r.business_id = p_business_id
   order by r.created_at desc;
$$;
grant execute on function public.my_redemptions(uuid) to authenticated;

-- ----- Reload PostgREST so the new RPC signatures are visible immediately -----
notify pgrst, 'reload schema';
