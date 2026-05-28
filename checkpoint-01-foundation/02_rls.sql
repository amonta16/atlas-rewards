-- =====================================================================
-- ATLAS REWARDS — CHECKPOINT 1: ROW-LEVEL SECURITY
-- =====================================================================
-- Enforces the three-tier view split (agency / manager / customer)
-- at the database layer so the app cannot leak data across businesses.
-- Run AFTER 01_schema.sql.
-- =====================================================================

-- Helper: who am I, and what role do I have? --------------------------
-- Returns 'agency_admin' if the caller is an agency admin (one row in
-- business_users with NULL business_id and role = 'agency_admin').
create or replace function public.current_role_name()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select 'agency_admin'
       from public.business_users
      where user_id = auth.uid()
        and role = 'agency_admin'
      limit 1),
    'customer'
  );
$$;

-- Returns the set of business IDs the caller manages as staff.
create or replace function public.current_managed_business_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select business_id
    from public.business_users
   where user_id = auth.uid()
     and business_id is not null;
$$;

-- True if caller is agency admin (full access).
create or replace function public.is_agency_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.business_users
     where user_id = auth.uid() and role = 'agency_admin'
  );
$$;

-- True if caller staffs the given business.
create or replace function public.staffs_business(b_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.business_users
     where user_id = auth.uid() and business_id = b_id
  ) or public.is_agency_admin();
$$;

-- =====================================================================
-- Enable RLS on every table
-- =====================================================================
alter table public.businesses             enable row level security;
alter table public.profiles               enable row level security;
alter table public.business_users         enable row level security;
alter table public.business_memberships   enable row level security;
alter table public.points_ledger          enable row level security;
alter table public.rewards                enable row level security;
alter table public.redemptions            enable row level security;
alter table public.referrals              enable row level security;
alter table public.reviews                enable row level security;
alter table public.events                 enable row level security;
alter table public.automation_rules       enable row level security;
alter table public.webhook_endpoints      enable row level security;

-- =====================================================================
-- BUSINESSES
-- =====================================================================
-- Customers can read any active business (they'll only ever query the one
-- their subdomain resolves to). Managers can read+update their own.
-- Agency admins have full access.
drop policy if exists biz_select_public on public.businesses;
create policy biz_select_public on public.businesses for select
  using (status = 'active' or public.staffs_business(id));

drop policy if exists biz_manage_admin on public.businesses;
create policy biz_manage_admin on public.businesses
  for all using (public.is_agency_admin()) with check (public.is_agency_admin());

drop policy if exists biz_update_manager on public.businesses;
create policy biz_update_manager on public.businesses for update
  using (public.staffs_business(id)) with check (public.staffs_business(id));

-- =====================================================================
-- PROFILES
-- =====================================================================
drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles for all
  using (id = auth.uid()) with check (id = auth.uid());

-- Staff can read profiles of members who belong to their business
drop policy if exists profiles_staff_read on public.profiles;
create policy profiles_staff_read on public.profiles for select
  using (
    public.is_agency_admin()
    or exists (
      select 1 from public.business_memberships m
       where m.user_id = profiles.id
         and m.business_id in (select public.current_managed_business_ids())
    )
  );

-- =====================================================================
-- BUSINESS_USERS  (staff roster)
-- =====================================================================
drop policy if exists bu_self on public.business_users;
create policy bu_self on public.business_users for select
  using (user_id = auth.uid() or public.is_agency_admin());

drop policy if exists bu_manage_admin on public.business_users;
create policy bu_manage_admin on public.business_users
  for all using (public.is_agency_admin()) with check (public.is_agency_admin());

-- =====================================================================
-- BUSINESS_MEMBERSHIPS
-- =====================================================================
drop policy if exists mem_self on public.business_memberships;
create policy mem_self on public.business_memberships
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists mem_staff on public.business_memberships;
create policy mem_staff on public.business_memberships for select
  using (public.staffs_business(business_id));

drop policy if exists mem_staff_write on public.business_memberships;
create policy mem_staff_write on public.business_memberships for update
  using (public.staffs_business(business_id))
  with check (public.staffs_business(business_id));

-- =====================================================================
-- POINTS_LEDGER  (immutable — no UPDATE/DELETE policies)
-- =====================================================================
drop policy if exists ledger_self_read on public.points_ledger;
create policy ledger_self_read on public.points_ledger for select
  using (
    exists (select 1 from public.business_memberships m
             where m.id = points_ledger.membership_id and m.user_id = auth.uid())
    or public.staffs_business(business_id)
  );

-- Inserts only via service_role (server-side function), never directly from client
drop policy if exists ledger_insert_staff on public.points_ledger;
create policy ledger_insert_staff on public.points_ledger for insert
  with check (public.staffs_business(business_id));

-- =====================================================================
-- REWARDS
-- =====================================================================
drop policy if exists rewards_public_read on public.rewards;
create policy rewards_public_read on public.rewards for select
  using (is_active or public.staffs_business(business_id));

drop policy if exists rewards_staff_manage on public.rewards;
create policy rewards_staff_manage on public.rewards
  for all using (public.staffs_business(business_id))
  with check (public.staffs_business(business_id));

-- =====================================================================
-- REDEMPTIONS
-- =====================================================================
drop policy if exists redemp_self on public.redemptions;
create policy redemp_self on public.redemptions for select
  using (
    exists (select 1 from public.business_memberships m
             where m.id = redemptions.membership_id and m.user_id = auth.uid())
    or public.staffs_business(business_id)
  );

drop policy if exists redemp_staff_write on public.redemptions;
create policy redemp_staff_write on public.redemptions for all
  using (public.staffs_business(business_id))
  with check (public.staffs_business(business_id));

-- =====================================================================
-- REFERRALS
-- =====================================================================
drop policy if exists ref_self on public.referrals;
create policy ref_self on public.referrals for select
  using (
    exists (select 1 from public.business_memberships m
             where m.id = referrals.referrer_membership_id and m.user_id = auth.uid())
    or public.staffs_business(business_id)
  );

drop policy if exists ref_staff_manage on public.referrals;
create policy ref_staff_manage on public.referrals for all
  using (public.staffs_business(business_id))
  with check (public.staffs_business(business_id));

-- =====================================================================
-- REVIEWS
-- =====================================================================
drop policy if exists rev_self on public.reviews;
create policy rev_self on public.reviews for select
  using (
    exists (select 1 from public.business_memberships m
             where m.id = reviews.membership_id and m.user_id = auth.uid())
    or public.staffs_business(business_id)
  );

drop policy if exists rev_self_submit on public.reviews;
create policy rev_self_submit on public.reviews for insert
  with check (
    exists (select 1 from public.business_memberships m
             where m.id = reviews.membership_id and m.user_id = auth.uid())
  );

drop policy if exists rev_staff_manage on public.reviews;
create policy rev_staff_manage on public.reviews for all
  using (public.staffs_business(business_id))
  with check (public.staffs_business(business_id));

-- =====================================================================
-- EVENTS / AUTOMATION_RULES / WEBHOOK_ENDPOINTS  (staff only)
-- =====================================================================
drop policy if exists events_staff on public.events;
create policy events_staff on public.events for all
  using (public.staffs_business(business_id))
  with check (public.staffs_business(business_id));

drop policy if exists auto_staff on public.automation_rules;
create policy auto_staff on public.automation_rules for all
  using (public.staffs_business(business_id))
  with check (public.staffs_business(business_id));

drop policy if exists wh_staff on public.webhook_endpoints;
create policy wh_staff on public.webhook_endpoints for all
  using (public.staffs_business(business_id))
  with check (public.staffs_business(business_id));
