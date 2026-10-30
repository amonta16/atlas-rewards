-- =====================================================================
-- CP-86 — Front-desk fixes & upgrades
-- =====================================================================
-- Self-contained + idempotent — safe to paste into the Supabase SQL
-- editor as one run, even on a database that missed earlier checkpoint
-- migrations (this file re-asserts everything it depends on).
--
--   1. DEDUCT-POINTS FIX — drop the points_ledger rule_type CHECK that
--      CP-85 rebuilt. Its list is missing 'manual_removal' (what the
--      front-desk "Remove points" writes), plus other server-set types
--      ('winback_bonus', 'signup_bonus', 'streak_milestone', …). CP-44.1
--      dropped this constraint on purpose: rule_type is only ever set by
--      SECURITY DEFINER RPCs, so the enum adds no safety — it just
--      rejects legitimate rows. (CP-46 notes say: do NOT re-add it.)
--
--   2. FRONT-DESK PIN AUTH — full re-assert of CP-49 Part A. Fixes both
--      "Could not find the function public.set_my_front_desk_pin … in
--      the schema cache" and PIN keypad logins not working (the login
--      API calls verify_front_desk_pin, which is also missing).
--
--   3. INACTIVE MEMBERS / WIN-BACK — re-assert inactive_members (v2) +
--      send_winback + customer_messages. v2 counts a member as inactive
--      when their last check-in is older than the window, OR they have
--      NEVER checked in and joined longer than the window ago (so brand
--      new signups don't instantly read as "lapsed").
--
--   4. MEMBERSHIP PASSES — businesses can now sell one-time passes
--      (1 / 3 / 6 / 12 months, each with its own price) alongside — or
--      instead of — the recurring monthly plan. A pass sets a hard
--      membership_expires_at; VIP status honors it everywhere.
--
--   5. FRONT-DESK VIP BADGE — member_vip_status RPC so a scanned member
--      clearly shows MEMBER + plan + expiry on the award panel.
--
--   6. ANNOUNCEMENTS — one simple manager-only message per business
--      ("Tuesday we're closing early"), shown as a dismissible banner in
--      the customer app until it expires or is cleared. Push goes out
--      through /api/notifications/announce-message.
-- =====================================================================

create extension if not exists pgcrypto with schema public;


-- =====================================================================
-- 1. DEDUCT-POINTS FIX
-- =====================================================================
-- rule_type is server-set only (SECURITY DEFINER RPCs); the enum guard
-- only blocks legitimate credits/removals. CP-85's raffle RPCs validate
-- their own rule types — they don't need the CHECK either.
alter table public.points_ledger
  drop constraint if exists points_ledger_rule_type_check;


-- =====================================================================
-- 2. FRONT-DESK PIN AUTH (CP-49 Part A re-assert)
-- =====================================================================

create table if not exists public.front_desk_pins (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  user_id         uuid not null references auth.users(id)        on delete cascade,
  display_name    text not null,
  pin_hash        text not null,
  role            text not null default 'business_staff'
                    check (role in ('business_staff','business_manager','agency_admin')),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (business_id, user_id)
);
create index if not exists front_desk_pins_biz_idx
  on public.front_desk_pins(business_id) where is_active;

-- RLS ON with NO policies → no client can read pin hashes directly.
alter table public.front_desk_pins enable row level security;

create table if not exists public.front_desk_throttle (
  business_id  uuid primary key references public.businesses(id) on delete cascade,
  fails        int not null default 0,
  locked_until timestamptz,
  updated_at   timestamptz not null default now()
);
alter table public.front_desk_throttle enable row level security;

-- Caller manages this business (manager OR agency admin).
create or replace function public.manages_business(p_business_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.business_users bu
    where bu.user_id = auth.uid()
      and (
        bu.role = 'agency_admin'
        or (bu.business_id = p_business_id and bu.role = 'business_manager')
      )
  );
$$;
grant execute on function public.manages_business(uuid) to authenticated;

-- Manager attaches / changes a PIN for a user_id.
create or replace function public.set_front_desk_pin(
  p_business_id uuid,
  p_user_id     uuid,
  p_display_name text,
  p_pin         text
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_role text;
  v_clash boolean;
begin
  if not public.manages_business(p_business_id) then
    raise exception 'permission denied';
  end if;
  if p_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN must be exactly 4 digits';
  end if;

  select exists (
    select 1 from public.front_desk_pins f
    where f.business_id = p_business_id
      and f.is_active
      and f.user_id <> p_user_id
      and f.pin_hash = crypt(p_pin, f.pin_hash)
  ) into v_clash;
  if v_clash then
    raise exception 'That PIN is already used by someone at this business — pick another';
  end if;

  select bu.role into v_role
    from public.business_users bu
   where bu.user_id = p_user_id
     and (bu.business_id = p_business_id or bu.role = 'agency_admin')
   order by case bu.role when 'agency_admin' then 0 when 'business_manager' then 1 else 2 end
   limit 1;

  insert into public.front_desk_pins
    (business_id, user_id, display_name, pin_hash, role, is_active, updated_at)
  values
    (p_business_id, p_user_id, p_display_name,
     crypt(p_pin, gen_salt('bf')), coalesce(v_role, 'business_staff'), true, now())
  on conflict (business_id, user_id) do update set
    display_name = excluded.display_name,
    pin_hash     = excluded.pin_hash,
    role         = excluded.role,
    is_active    = true,
    updated_at   = now();

  delete from public.front_desk_throttle where business_id = p_business_id;
end; $$;
grant execute on function public.set_front_desk_pin(uuid, uuid, text, text) to authenticated;

-- A manager gives THEMSELVES a keypad PIN.
create or replace function public.set_my_front_desk_pin(
  p_business_id uuid,
  p_pin         text
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_name text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not public.manages_business(p_business_id) then
    raise exception 'permission denied';
  end if;
  select coalesce(full_name, email, 'Manager') into v_name
    from public.profiles where id = auth.uid();
  perform public.set_front_desk_pin(p_business_id, auth.uid(), coalesce(v_name, 'Manager'), p_pin);
end; $$;
grant execute on function public.set_my_front_desk_pin(uuid, text) to authenticated;

-- Manager view (no hashes leave the DB).
create or replace function public.list_front_desk_pins(p_business_id uuid)
returns table (
  user_id      uuid,
  display_name text,
  role         text,
  is_active    boolean,
  is_self      boolean,
  created_at   timestamptz
)
language sql stable security definer set search_path = public as $$
  select f.user_id, f.display_name, f.role, f.is_active,
         (f.user_id = auth.uid()) as is_self, f.created_at
    from public.front_desk_pins f
   where f.business_id = p_business_id
     and f.is_active
     and public.manages_business(p_business_id)
   order by f.created_at;
$$;
grant execute on function public.list_front_desk_pins(uuid) to authenticated;

-- Deactivate a PIN (keypad access revoked).
create or replace function public.remove_front_desk_pin(
  p_business_id uuid,
  p_user_id     uuid
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.manages_business(p_business_id) then
    raise exception 'permission denied';
  end if;
  update public.front_desk_pins
     set is_active = false, updated_at = now()
   where business_id = p_business_id and user_id = p_user_id;
end; $$;
grant execute on function public.remove_front_desk_pin(uuid, uuid) to authenticated;

-- Called ONLY by the login API (service role). Per-business lockout:
-- 8 consecutive misses → keypad frozen for 5 minutes.
create or replace function public.verify_front_desk_pin(
  p_business_id uuid,
  p_pin         text
)
returns table (
  user_id uuid,
  ok      boolean,
  locked  boolean
)
language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid;
  v_locked  timestamptz;
begin
  select locked_until into v_locked
    from public.front_desk_throttle where business_id = p_business_id;
  if v_locked is not null and v_locked > now() then
    user_id := null; ok := false; locked := true; return next; return;
  end if;

  select f.user_id into v_uid
    from public.front_desk_pins f
   where f.business_id = p_business_id
     and f.is_active
     and f.pin_hash = crypt(p_pin, f.pin_hash)
   limit 1;

  if v_uid is not null then
    delete from public.front_desk_throttle where business_id = p_business_id;
    user_id := v_uid; ok := true; locked := false; return next; return;
  end if;

  insert into public.front_desk_throttle (business_id, fails, updated_at)
  values (p_business_id, 1, now())
  on conflict (business_id) do update set
    fails        = public.front_desk_throttle.fails + 1,
    locked_until = case when public.front_desk_throttle.fails + 1 >= 8
                        then now() + interval '5 minutes' else null end,
    updated_at   = now();

  select locked_until into v_locked
    from public.front_desk_throttle where business_id = p_business_id;
  user_id := null; ok := false; locked := (v_locked is not null and v_locked > now());
  return next;
end; $$;
revoke all on function public.verify_front_desk_pin(uuid, text) from public, anon, authenticated;
grant execute on function public.verify_front_desk_pin(uuid, text) to service_role;


-- =====================================================================
-- 3. INACTIVE MEMBERS / WIN-BACK
-- =====================================================================

-- v2: also counts never-checked-in members once they've been enrolled
-- longer than the window, and returns joined_at so the UI can say
-- "Never checked in · joined May 3". Return type changed → drop first.
drop function if exists public.inactive_members(uuid, int, int);

create or replace function public.inactive_members(
  p_business_id uuid,
  p_min_days    int default 60,
  p_limit       int default 50
)
returns table (
  membership_id uuid, full_name text, email text, phone text,
  last_visit_at timestamptz, days_since_last numeric, visit_count int,
  joined_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select m.id, p.full_name::text, p.email::text, p.phone::text,
         m.last_visit_at,
         case when m.last_visit_at is null then null
              else (extract(epoch from (now() - m.last_visit_at)) / 86400.0)::numeric(10,1)
              end as days_since_last,
         m.visit_count,
         m.joined_at
    from public.business_memberships m
    left join public.profiles p on p.id = m.user_id
   where m.business_id = p_business_id
     and public.staffs_business(p_business_id)
     and (
       (m.last_visit_at is not null
          and m.last_visit_at < now() - make_interval(days => greatest(coalesce(p_min_days, 60), 1)))
       or
       (m.last_visit_at is null
          and m.joined_at < now() - make_interval(days => greatest(coalesce(p_min_days, 60), 1)))
     )
   order by m.last_visit_at asc nulls last
   limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;
grant execute on function public.inactive_members(uuid, int, int) to authenticated;

-- The table the win-back message lands in (customer's personal banner).
create table if not exists public.customer_messages (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  membership_id   uuid not null references public.business_memberships(id) on delete cascade,
  kind            text not null check (kind in ('winback','reminder','offer','milestone')),
  title           text not null,
  body            text,
  bonus_points    int,
  expires_at      timestamptz,
  is_dismissed    boolean not null default false,
  created_at      timestamptz not null default now()
);
create index if not exists customer_messages_member_idx
  on public.customer_messages(membership_id, created_at desc);

alter table public.customer_messages enable row level security;

drop policy if exists cm_staff_all on public.customer_messages;
create policy cm_staff_all on public.customer_messages
  for all using (public.staffs_business(business_id))
  with check (public.staffs_business(business_id));

drop policy if exists cm_member_read on public.customer_messages;
create policy cm_member_read on public.customer_messages
  for all using (
    exists (select 1 from public.business_memberships m
             where m.id = customer_messages.membership_id and m.user_id = auth.uid())
  );

-- Realtime so the customer banner appears the moment a manager sends it.
do $$ begin
  alter publication supabase_realtime add table public.customer_messages;
exception when duplicate_object then null;
          when undefined_object then null; end $$;

-- The RPC the "We miss you" composer calls (per member).
create or replace function public.send_winback(
  p_business_id   uuid,
  p_membership_id uuid,
  p_title         text default null,
  p_body          text default null,
  p_bonus_points  int  default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.staffs_business(p_business_id) then raise exception 'permission denied'; end if;

  insert into public.customer_messages
    (business_id, membership_id, kind, title, body, bonus_points, expires_at)
  values
    (p_business_id, p_membership_id, 'winback',
     coalesce(p_title, 'We miss you ☕'),
     coalesce(p_body, 'Tap to claim your come-back bonus.'),
     p_bonus_points,
     now() + interval '14 days')
  returning id into v_id;

  if coalesce(p_bonus_points, 0) > 0 then
    insert into public.points_ledger
      (business_id, membership_id, delta, rule_type, notes)
    values
      (p_business_id, p_membership_id, p_bonus_points, 'winback_bonus',
       'Win-back bonus');
    update public.business_memberships
       set points_balance = points_balance + p_bonus_points,
           lifetime_points_earned = lifetime_points_earned + p_bonus_points
     where id = p_membership_id;
  end if;
  return v_id;
end; $$;
grant execute on function public.send_winback(uuid, uuid, text, text, int) to authenticated;


-- =====================================================================
-- 4. MEMBERSHIP PASSES
-- =====================================================================

-- Config: a business can offer one-time duration passes, and can turn
-- the recurring monthly plan off if it only wants passes.
-- pass_options is a jsonb array of:
--   { "id": "p1", "label": "3-Month Pass", "months": 3, "price_cents": 2500 }
alter table public.business_membership_billing
  add column if not exists pass_options  jsonb   not null default '[]'::jsonb,
  add column if not exists offer_monthly boolean not null default true;

-- Member rows: hard expiry (passes), the plan they're on, and — while
-- pending — the plan they ASKED for so the front desk knows what to charge.
alter table public.business_memberships
  add column if not exists membership_expires_at   timestamptz,
  add column if not exists membership_plan_label   text,
  add column if not exists membership_pending_plan jsonb;

-- ---------------------------------------------------------------------
-- membership_billing_public — now exposes pass options (return type
-- changed → drop first).
-- ---------------------------------------------------------------------
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
  payment_instructions       text,
  pass_options               jsonb,
  offer_monthly              boolean
)
language sql stable security definer set search_path = public as $$
  select b.is_enabled, b.price_cents, b.membership_name, b.perks,
         b.monthly_cash_balance_cents, b.points_multiplier,
         b.has_priority_booking, b.image_url,
         b.payment_mode, b.external_payment_url, b.payment_instructions,
         coalesce(b.pass_options, '[]'::jsonb), coalesce(b.offer_monthly, true)
    from public.business_membership_billing b
   where b.business_id = p_business_id;
$$;
grant execute on function public.membership_billing_public(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- upsert_membership_billing_v3 — v2 + pass fields.
-- ---------------------------------------------------------------------
create or replace function public.upsert_membership_billing_v3(
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
  p_payment_instructions        text default null,
  p_pass_options                jsonb default '[]'::jsonb,
  p_offer_monthly               boolean default true
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_pass jsonb;
begin
  if not public.is_business_manager(p_business_id) and not public.is_agency_admin() then
    raise exception 'permission denied — manager or agency admin only';
  end if;
  if p_payment_mode not in ('stripe','external_link','in_person') then
    raise exception 'invalid payment_mode: %', p_payment_mode;
  end if;

  -- Validate the pass list: max 6, each needs a label, 1–24 months, price ≥ 0.
  if jsonb_typeof(coalesce(p_pass_options, '[]'::jsonb)) <> 'array' then
    raise exception 'pass_options must be a JSON array';
  end if;
  if jsonb_array_length(coalesce(p_pass_options, '[]'::jsonb)) > 6 then
    raise exception 'a maximum of 6 passes is supported';
  end if;
  for v_pass in select elem from jsonb_array_elements(coalesce(p_pass_options, '[]'::jsonb)) as t(elem)
  loop
    if coalesce(btrim(v_pass->>'label'), '') = '' then
      raise exception 'every pass needs a label';
    end if;
    if coalesce((v_pass->>'months')::int, 0) not between 1 and 24 then
      raise exception 'pass duration must be between 1 and 24 months';
    end if;
    if coalesce((v_pass->>'price_cents')::int, -1) < 0 then
      raise exception 'pass price must be zero or more';
    end if;
  end loop;

  if not coalesce(p_offer_monthly, true)
     and jsonb_array_length(coalesce(p_pass_options, '[]'::jsonb)) = 0
     and coalesce(p_is_enabled, false) then
    raise exception 'enable the monthly plan or add at least one pass';
  end if;

  insert into public.business_membership_billing as b (
    business_id, is_enabled, membership_name, price_cents, perks,
    monthly_cash_balance_cents, points_multiplier, has_priority_booking,
    image_url, payment_mode, external_payment_url, payment_instructions,
    pass_options, offer_monthly
  )
  values (
    p_business_id, p_is_enabled, p_membership_name, p_price_cents, p_perks,
    p_monthly_cash_balance_cents, p_points_multiplier, p_has_priority_booking,
    p_image_url, p_payment_mode, p_external_payment_url, p_payment_instructions,
    coalesce(p_pass_options, '[]'::jsonb), coalesce(p_offer_monthly, true)
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
         pass_options               = excluded.pass_options,
         offer_monthly              = excluded.offer_monthly,
         updated_at                 = now();
end; $$;
grant execute on function public.upsert_membership_billing_v3(
  uuid, boolean, text, int, text[], int, numeric, boolean, text, text, text, text, jsonb, boolean
) to authenticated;

-- ---------------------------------------------------------------------
-- request_membership_v2 — customer picks the monthly plan OR a pass.
-- The chosen plan is snapshotted server-side (price comes from the DB,
-- never from the client) into membership_pending_plan so the front desk
-- sees exactly what to charge.
-- ---------------------------------------------------------------------
create or replace function public.request_membership_v2(
  p_business_id uuid,
  p_pass_id     text default null
)
returns table (status text, payment_mode text, payment_url text, plan jsonb)
language plpgsql security definer set search_path = public as $$
declare
  v_billing record;
  v_user    uuid := auth.uid();
  v_mem_id  uuid;
  v_plan    jsonb;
  v_pass    jsonb;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select b.payment_mode, b.external_payment_url, b.price_cents,
         coalesce(b.pass_options, '[]'::jsonb) as pass_options,
         coalesce(b.offer_monthly, true) as offer_monthly
    into v_billing
    from public.business_membership_billing b
   where b.business_id = p_business_id;

  if not found then
    raise exception 'membership billing not configured for this business';
  end if;
  if v_billing.payment_mode = 'stripe' then
    raise exception 'this business is configured for Stripe — use the checkout API instead';
  end if;

  if p_pass_id is not null then
    select elem into v_pass
      from jsonb_array_elements(v_billing.pass_options) elem
     where elem->>'id' = p_pass_id
     limit 1;
    if v_pass is null then raise exception 'that pass is no longer available'; end if;
    v_plan := jsonb_build_object(
      'kind', 'pass',
      'id', v_pass->>'id',
      'label', v_pass->>'label',
      'months', (v_pass->>'months')::int,
      'price_cents', (v_pass->>'price_cents')::int
    );
  else
    if not v_billing.offer_monthly then
      raise exception 'this business only offers passes — pick a pass';
    end if;
    v_plan := jsonb_build_object(
      'kind', 'monthly',
      'label', 'Monthly',
      'price_cents', v_billing.price_cents
    );
  end if;

  select id into v_mem_id
    from public.business_memberships
   where business_id = p_business_id and user_id = v_user;

  if v_mem_id is null then
    insert into public.business_memberships
      (business_id, user_id, status, membership_payment_status, membership_pending_plan)
    values
      (p_business_id, v_user, 'pending', 'pending', v_plan)
    returning id into v_mem_id;
  else
    update public.business_memberships
       set status                     = 'pending',
           membership_payment_status  = 'pending',
           membership_pending_plan    = v_plan
     where id = v_mem_id;
  end if;

  return query select 'pending'::text, v_billing.payment_mode, v_billing.external_payment_url, v_plan;
end; $$;
grant execute on function public.request_membership_v2(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- list_pending_memberships — now returns the requested plan (return
-- type changed → drop first).
-- ---------------------------------------------------------------------
drop function if exists public.list_pending_memberships(uuid);
create function public.list_pending_memberships(p_business_id uuid)
returns table (
  membership_id  uuid,
  user_id        uuid,
  full_name      text,
  email          text,
  phone          text,
  requested_at   timestamptz,
  pending_plan   jsonb
)
language sql stable security definer set search_path = public as $$
  select m.id, m.user_id,
         coalesce(p.full_name, split_part(p.email::text, '@', 1)),
         p.email::text,
         p.phone::text,
         m.created_at,
         m.membership_pending_plan
    from public.business_memberships m
    join public.profiles p on p.id = m.user_id
   where m.business_id = p_business_id
     and m.membership_payment_status = 'pending'
     and public.staffs_business(p_business_id)
   order by m.created_at asc;
$$;
grant execute on function public.list_pending_memberships(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- activate_pending_membership — same signature as CP-42, now applies
-- the requested plan: a pass sets membership_expires_at, monthly stays
-- open-ended. Notification tells the member what they got.
-- ---------------------------------------------------------------------
create or replace function public.activate_pending_membership(
  p_membership_id uuid,
  p_note          text default null
)
returns table (membership_id uuid, status text)
language plpgsql security definer set search_path = public as $$
declare
  v_business uuid;
  v_plan     jsonb;
  v_months   int;
  v_label    text;
  v_expires  timestamptz;
begin
  select bm.business_id, bm.membership_pending_plan
    into v_business, v_plan
    from public.business_memberships bm
   where bm.id = p_membership_id;

  if v_business is null then raise exception 'membership not found'; end if;
  if not public.staffs_business(v_business) then
    raise exception 'permission denied — staff only';
  end if;

  v_label  := coalesce(v_plan->>'label', 'Monthly');
  v_months := case when v_plan->>'kind' = 'pass' then (v_plan->>'months')::int else null end;
  v_expires := case when v_months is not null then now() + make_interval(months => v_months) else null end;

  update public.business_memberships
     set status                     = 'active',
         membership_payment_status  = 'paid',
         membership_paid_at         = now(),
         membership_plan_label      = v_label,
         membership_expires_at      = v_expires,
         membership_pending_plan    = null,
         updated_at                 = now()
   where id = p_membership_id;

  insert into public.notifications (user_id, business_id, kind, title, body, link_path)
  select m.user_id, m.business_id, 'generic',
         'You''re a member! 🎉',
         coalesce(p_note,
           case when v_expires is not null
                then 'Your ' || v_label || ' is active until ' || to_char(v_expires, 'Mon DD, YYYY') || '. Tap to see your perks.'
                else 'Your membership is active. Tap to see your perks.'
           end),
         '/app'
    from public.business_memberships m
   where m.id = p_membership_id;

  return query select p_membership_id, 'active'::text;
end; $$;
grant execute on function public.activate_pending_membership(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- apply_membership_purchase — service-role helper the Stripe webhook
-- calls after a successful checkout (subscription OR one-time pass).
-- ---------------------------------------------------------------------
create or replace function public.apply_membership_purchase(
  p_business_id uuid,
  p_user_id     uuid,
  p_months      int  default null,   -- null = recurring monthly
  p_label       text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_mem_id  uuid;
  v_expires timestamptz := case when p_months is not null
                                then now() + make_interval(months => p_months)
                                else null end;
begin
  select id into v_mem_id
    from public.business_memberships
   where business_id = p_business_id and user_id = p_user_id;

  if v_mem_id is null then
    insert into public.business_memberships
      (business_id, user_id, status, membership_payment_status,
       membership_paid_at, membership_plan_label, membership_expires_at)
    values
      (p_business_id, p_user_id, 'active', 'paid',
       now(), coalesce(p_label, 'Monthly'), v_expires);
  else
    update public.business_memberships
       set status                     = 'active',
           membership_payment_status  = 'paid',
           membership_paid_at         = now(),
           membership_plan_label      = coalesce(p_label, 'Monthly'),
           membership_expires_at      = v_expires,
           membership_pending_plan    = null,
           updated_at                 = now()
     where id = v_mem_id;
  end if;
end; $$;
revoke all on function public.apply_membership_purchase(uuid, uuid, int, text) from public, anon, authenticated;
grant execute on function public.apply_membership_purchase(uuid, uuid, int, text) to service_role;

-- ---------------------------------------------------------------------
-- member_membership_status — customer-side status. Return type changed
-- (adds expires_at + plan_label) → drop first. A pass past its expiry
-- reads as NOT paid everywhere.
-- ---------------------------------------------------------------------
drop function if exists public.member_membership_status(uuid);
create function public.member_membership_status(p_business_id uuid)
returns table (
  is_paid          boolean,
  paid_at          timestamptz,
  renewal_due_at   timestamptz,
  expires_at       timestamptz,
  plan_label       text
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_user    uuid := auth.uid();
  v_paid    boolean := false;
  v_paid_at timestamptz;
  v_expires timestamptz;
  v_label   text;
  v_renews  timestamptz;
  v_days    int;
begin
  if v_user is null then
    return query select false, null::timestamptz, null::timestamptz, null::timestamptz, null::text;
    return;
  end if;

  select (bm.membership_payment_status = 'paid'),
         bm.membership_paid_at, bm.membership_expires_at, bm.membership_plan_label
    into v_paid, v_paid_at, v_expires, v_label
    from public.business_memberships bm
   where bm.business_id = p_business_id
     and bm.user_id     = v_user
   limit 1;

  -- A hard expiry in the past = no longer a member.
  if v_expires is not null and v_expires <= now() then
    v_paid := false;
  end if;

  -- Rolling 30-day renewal hint only applies to open-ended (monthly) plans.
  if coalesce(v_paid, false) and v_expires is null and v_paid_at is not null then
    v_days   := greatest(0, extract(epoch from (now() - v_paid_at))::int / 86400);
    v_renews := v_paid_at + ((v_days / 30 + 1) * 30 || ' days')::interval;
  end if;

  return query select coalesce(v_paid, false), v_paid_at, v_renews, v_expires, v_label;
end; $$;
grant execute on function public.member_membership_status(uuid) to authenticated;


-- =====================================================================
-- 5. FRONT-DESK VIP BADGE
-- =====================================================================
-- Staff-side status for one scanned member: is this person a member,
-- on what plan, and when does it expire?
create or replace function public.member_vip_status(p_membership_id uuid)
returns table (
  is_member      boolean,
  plan_label     text,
  member_since   timestamptz,
  expires_at     timestamptz,
  just_expired   boolean,
  payment_status text
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_business uuid;
  v_row record;
begin
  select bm.business_id, bm.membership_payment_status, bm.membership_paid_at,
         bm.membership_expires_at, bm.membership_plan_label
    into v_row
    from public.business_memberships bm
   where bm.id = p_membership_id;

  if not found then
    return query select false, null::text, null::timestamptz, null::timestamptz, false, null::text;
    return;
  end if;
  if not public.staffs_business(v_row.business_id) then
    raise exception 'permission denied';
  end if;

  return query select
    (v_row.membership_payment_status = 'paid'
       and (v_row.membership_expires_at is null or v_row.membership_expires_at > now())),
    v_row.membership_plan_label,
    v_row.membership_paid_at,
    v_row.membership_expires_at,
    (v_row.membership_payment_status = 'paid'
       and v_row.membership_expires_at is not null
       and v_row.membership_expires_at <= now()),
    v_row.membership_payment_status;
end; $$;
grant execute on function public.member_vip_status(uuid) to authenticated;

-- list_business_members: is_vip now honors pass expiry (same return
-- type as CP-48 → CREATE OR REPLACE is safe).
create or replace function public.list_business_members(
  p_business_id uuid,
  p_limit       integer default 500,
  p_offset      integer default 0
)
returns table (
  membership_id  uuid,
  user_id        uuid,
  full_name      text,
  email          text,
  phone          text,
  referral_code  text,
  points_balance integer,
  tier           text,
  joined_at      timestamptz,
  visit_count    integer,
  is_vip         boolean
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.staffs_business(p_business_id) then
    raise exception 'permission denied';
  end if;

  return query
    select m.id, m.user_id,
           p.full_name::text, p.email::text, p.phone::text,
           m.referral_code::text, m.points_balance, m.tier::text,
           m.joined_at, m.visit_count,
           coalesce(m.membership_payment_status = 'paid'
                    and (m.membership_expires_at is null or m.membership_expires_at > now()), false)
      from public.business_memberships m
      join public.profiles p on p.id = m.user_id
     where m.business_id = p_business_id
     order by coalesce(m.last_visit_at, m.joined_at) desc
     limit greatest(p_limit, 1) offset greatest(p_offset, 0);
end;
$$;
grant execute on function public.list_business_members(uuid, integer, integer) to authenticated;


-- =====================================================================
-- 6. ANNOUNCEMENTS
-- =====================================================================
-- One live announcement per business. Managers (and agency admins)
-- write it; every customer of the business can read it. The message is
-- public-facing by nature, so the read policy is open — writes stay
-- manager-gated.
create table if not exists public.business_announcements (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  message     text not null,
  expires_at  timestamptz,
  created_by  uuid references auth.users(id) on delete set null,
  updated_at  timestamptz not null default now()
);
alter table public.business_announcements enable row level security;

drop policy if exists ba_read on public.business_announcements;
create policy ba_read on public.business_announcements
  for select to anon, authenticated using (true);

drop policy if exists ba_manager_write on public.business_announcements;
create policy ba_manager_write on public.business_announcements
  for all to authenticated
  using      (public.is_business_manager(business_id))
  with check (public.is_business_manager(business_id));

-- Realtime so the banner shows up / clears without a refresh.
do $$ begin
  alter publication supabase_realtime add table public.business_announcements;
exception when duplicate_object then null;
          when undefined_object then null; end $$;

-- Manager-gated write RPCs (belt and suspenders with the RLS policy —
-- and they stamp created_by/updated_at consistently).
create or replace function public.set_business_announcement(
  p_business_id uuid,
  p_message     text,
  p_expires_at  timestamptz default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_business_manager(p_business_id) then
    raise exception 'permission denied — manager only';
  end if;
  if coalesce(btrim(p_message), '') = '' then
    raise exception 'announcement message is required';
  end if;
  if length(p_message) > 280 then
    raise exception 'keep the announcement under 280 characters';
  end if;

  insert into public.business_announcements (business_id, message, expires_at, created_by, updated_at)
  values (p_business_id, btrim(p_message), p_expires_at, auth.uid(), now())
  on conflict (business_id) do update set
    message    = excluded.message,
    expires_at = excluded.expires_at,
    created_by = excluded.created_by,
    updated_at = now();
end; $$;
grant execute on function public.set_business_announcement(uuid, text, timestamptz) to authenticated;

create or replace function public.clear_business_announcement(p_business_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_business_manager(p_business_id) then
    raise exception 'permission denied — manager only';
  end if;
  delete from public.business_announcements where business_id = p_business_id;
end; $$;
grant execute on function public.clear_business_announcement(uuid) to authenticated;


-- =====================================================================
-- Refresh PostgREST so every new/changed RPC is callable immediately.
-- =====================================================================
notify pgrst, 'reload schema';

-- =====================================================================
-- Verification:
--   select conname from pg_constraint where conname = 'points_ledger_rule_type_check';  -- 0 rows
--   select proname from pg_proc where proname in
--     ('set_my_front_desk_pin','verify_front_desk_pin','inactive_members',
--      'send_winback','request_membership_v2','member_vip_status',
--      'set_business_announcement');                                                    -- 7 rows
-- =====================================================================
