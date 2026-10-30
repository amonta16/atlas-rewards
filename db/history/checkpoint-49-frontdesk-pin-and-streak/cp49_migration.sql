-- =====================================================================
-- CP-49 — Front-desk PIN login + streak display/UX fixes
-- =====================================================================
-- Apply AFTER cp48_migration.sql. Idempotent — safe to re-run.
--
-- PART A — Front-desk PIN auth
--   Front desk staff no longer sign in with email + password. A manager
--   sets up a NAME + 4-digit PIN; the staffer taps that PIN on a branded
--   per-business keypad (/<slug>/frontdesk) and lands in the front-desk
--   view. Under the hood each PIN still maps to a real (hidden) auth user
--   with the business_staff role, so every existing RLS policy keeps
--   working unchanged. Managers keep their email+password login AND can
--   set themselves a PIN for the keypad.
--
--   Tables:  front_desk_pins, front_desk_throttle
--   RPCs:    set_front_desk_pin, set_my_front_desk_pin,
--            list_front_desk_pins, remove_front_desk_pin,
--            verify_front_desk_pin (service-role only)
--
-- PART B — Streak fixes
--   1. get_streak_status now returns period_start / period_end so the
--      customer widget can show the real calendar window of the current
--      period ("This week: Jun 8 – Jun 14") and clear up the "which week
--      am I on?" confusion.
--   2. gift_kind is now AUTHORITATIVE over a stale reward_id. A milestone
--      Andrew switched from "Pick a reward" to "Award points" used to keep
--      its old reward_id, so the widget treated it as a reward and hid the
--      points number (the Starbucks "D3 points not showing" bug). We both
--      (a) normalize existing data — drop reward_id on points milestones —
--      and (b) stop enriching points milestones with reward image/name.
-- =====================================================================

create extension if not exists pgcrypto with schema public;


-- =====================================================================
-- PART A — FRONT-DESK PIN AUTH
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
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

-- RLS ON with NO policies → no anon/authenticated client can read the
-- pin_hash directly. All access goes through the SECURITY DEFINER RPCs
-- below (or the service role, which bypasses RLS).
alter table public.front_desk_pins enable row level security;

-- Per-business brute-force throttle. A 4-digit PIN is only 10k combos, so
-- we lock the WHOLE keypad for a business after too many misses in a row.
create table if not exists public.front_desk_throttle (
  business_id  uuid primary key references public.businesses(id) on delete cascade,
  fails        int not null default 0,
  locked_until timestamptz,
  updated_at   timestamptz not null default now()
);
alter table public.front_desk_throttle enable row level security;


-- ---------------------------------------------------------------------
-- Helper: caller manages this business (manager OR agency admin)
-- ---------------------------------------------------------------------
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


-- ---------------------------------------------------------------------
-- set_front_desk_pin — manager attaches / changes a PIN for a user_id
-- ---------------------------------------------------------------------
-- Used by /api/frontdesk/create after it provisions the hidden auth user,
-- and by the "Change PIN" action. Validates the PIN is exactly 4 digits
-- and unique within the business so the keypad can identify who tapped it.
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

  -- PIN must be unique among OTHER active staff in this business, so a
  -- single keypad entry maps to exactly one person.
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

  -- Role label for display (informational only — RLS still keys off
  -- business_users). Defaults to business_staff if no row yet.
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

  -- A successful PIN change clears any keypad lockout for the business.
  delete from public.front_desk_throttle where business_id = p_business_id;
end; $$;
grant execute on function public.set_front_desk_pin(uuid, uuid, text, text) to authenticated;


-- ---------------------------------------------------------------------
-- set_my_front_desk_pin — a manager gives THEMSELVES a keypad PIN
-- ---------------------------------------------------------------------
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


-- ---------------------------------------------------------------------
-- list_front_desk_pins — manager view (NO hashes leave the DB)
-- ---------------------------------------------------------------------
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


-- ---------------------------------------------------------------------
-- remove_front_desk_pin — deactivate a PIN (keypad access revoked)
-- ---------------------------------------------------------------------
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


-- ---------------------------------------------------------------------
-- verify_front_desk_pin — called ONLY by the login API (service role)
-- ---------------------------------------------------------------------
-- Returns the matching user_id on success. Enforces a per-business
-- lockout: 8 consecutive misses → keypad frozen for 5 minutes. Granted
-- to service_role only so a browser client can't brute-force it directly.
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

  -- Miss → bump the counter; freeze after 8 in a row.
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
-- PART B — STREAK FIXES
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) Normalize existing milestones: a points milestone must not carry a
--     leftover reward_id (the source of the "points won't show" bug).
-- ---------------------------------------------------------------------
update public.streak_config sc
   set milestones = (
     select coalesce(jsonb_agg(
              case
                when (m->>'gift_kind') = 'points'
                     and coalesce(m->>'reward_id','') <> ''
                then (m - 'reward_id')
                else m
              end
              order by ord
            ), '[]'::jsonb)
       from jsonb_array_elements(sc.milestones) with ordinality as t(m, ord)
   )
 where sc.milestones is not null
   and exists (
     select 1 from jsonb_array_elements(sc.milestones) m
      where (m->>'gift_kind') = 'points'
        and coalesce(m->>'reward_id','') <> ''
   );


-- ---------------------------------------------------------------------
-- (2) get_streak_status v2 — adds period_start / period_end, and only
--     enriches a milestone with reward image/name when it is NOT a
--     points milestone (gift_kind authoritative over a stale reward_id).
-- ---------------------------------------------------------------------
-- We ADD two OUT columns (period_start / period_end), which changes the
-- return type — Postgres won't CREATE OR REPLACE over a different row
-- type, so drop the old signature first. Safe: no views depend on it.
drop function if exists public.get_streak_status(uuid, uuid);

create or replace function public.get_streak_status(
  p_business_id   uuid,
  p_membership_id uuid
)
returns table (
  is_enabled         boolean,
  period_type        text,
  checkins_required_per_period int,
  current_streak     int,
  longest_streak     int,
  total_checkins     int,
  last_checkin_at    timestamptz,
  checked_in_this_period boolean,
  milestones         jsonb,
  claimed_milestones int[],
  period_start       timestamptz,
  period_end         timestamptz
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_cfg   record;
  v_state record;
  v_period_start timestamptz;
  v_period_end   timestamptz;
  v_enriched jsonb;
begin
  select * into v_cfg from public.streak_config where business_id = p_business_id;
  if v_cfg is null or not v_cfg.is_enabled then
    is_enabled := false;
    return next; return;
  end if;

  v_period_start := public.streak_period_start(now(), v_cfg.period_type);
  v_period_end := case v_cfg.period_type
    when 'daily'   then v_period_start + interval '1 day'
    when 'weekly'  then v_period_start + interval '1 week'
    when 'monthly' then v_period_start + interval '1 month'
    else v_period_start + interval '1 day'
  end;

  select * into v_state from public.member_streaks
   where business_id = p_business_id and membership_id = p_membership_id;

  -- Enrich with the linked reward's image/name, but ONLY for milestones
  -- that are actually reward-kind. gift_kind='points' (or a missing
  -- gift_kind with a points value) is treated as points and gets no
  -- reward fields, so the client renders the points number.
  with src as (
    select m.elem, m.ord
      from jsonb_array_elements(coalesce(v_cfg.milestones, '[]'::jsonb))
           with ordinality as m(elem, ord)
  )
  select coalesce(jsonb_agg(
           case
             when (src.elem->>'gift_kind') = 'reward'
              and nullif(src.elem->>'reward_id','') is not null
             then src.elem || jsonb_build_object(
                    'reward_image_url', r.image_url,
                    'reward_name',      r.name
                  )
             else (src.elem - 'reward_image_url' - 'reward_name')
           end
           order by src.ord
         ), '[]'::jsonb)
    into v_enriched
    from src
    left join public.rewards r
      on (src.elem->>'gift_kind') = 'reward'
     and r.id = nullif(src.elem->>'reward_id','')::uuid;

  is_enabled                  := true;
  period_type                 := v_cfg.period_type;
  checkins_required_per_period:= v_cfg.checkins_required_per_period;
  current_streak              := coalesce(v_state.current_streak, 0);
  longest_streak              := coalesce(v_state.longest_streak, 0);
  total_checkins              := coalesce(v_state.total_checkins, 0);
  last_checkin_at             := v_state.last_checkin_at;
  checked_in_this_period      := v_state.period_started_at = v_period_start
                                  and v_state.current_period_checkins >= v_cfg.checkins_required_per_period;
  milestones                  := v_enriched;
  claimed_milestones          := coalesce(v_state.claimed_milestones, '{}'::int[]);
  period_start                := v_period_start;
  period_end                  := v_period_end;
  return next;
end; $$;
grant execute on function public.get_streak_status(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
