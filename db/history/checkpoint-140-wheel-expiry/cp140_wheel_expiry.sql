-- ============================================================================
-- CP-140 — Prize Wheel: per-prize expiry windows
-- ----------------------------------------------------------------------------
-- WHY
--   Until now every reward won on the wheel was created with a hard-coded
--   30-day window (spin_daily_reward: `now() + interval '30 days'`). That
--   makes a genuinely valuable prize expensive to give away often, so pools
--   drift toward small point prizes and the wheel stops being exciting.
--
--   With a per-prize window the owner can put a high-value prize on the wheel
--   MORE often and still control the cost: "50% off batting cage time — must
--   be used within 3 days" both caps the liability and manufactures a second
--   visit on a day the customer wasn't already coming.
--
-- WHAT THIS DOES
--   1. mystery_reward_pool.expires_days  — per-prize window; NULL = 30 days
--      (exactly today's behaviour, so every existing prize is untouched).
--   2. business_timezone()  — the business's local zone, read from the
--      existing contact_info jsonb (no new column), validated against
--      pg_timezone_names, falling back to America/Los_Angeles.
--   3. prize_expires_at()   — turns a day count into END OF THAT LOCAL DAY,
--      so "3 days" means "good through Thursday night", not "72 hours from
--      9:42pm". Rounding is always in the customer's favour.
--   4. upsert_mystery_prize() gains p_expires_days  (drop + recreate: a new
--      trailing DEFAULT arg would otherwise leave an ambiguous overload).
--   5. spin_daily_reward() uses the per-prize window and RETURNS the expiry
--      as a new trailing column `prize_expires_at`, so the win reveal can
--      state the deadline at the moment of the win.
--   6. Grants set the CP-138 way (authenticated only, never anon). Safe to
--      run before OR after CP-138 — the two don't depend on each other.
--
-- SAFE TO RE-RUN. Idempotent. Single transaction.
-- ============================================================================

begin;

-- ─── §1 — schema ────────────────────────────────────────────────────────────

alter table public.mystery_reward_pool
  add column if not exists expires_days integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'mystery_reward_pool_expires_days_ck'
       and conrelid = 'public.mystery_reward_pool'::regclass
  ) then
    alter table public.mystery_reward_pool
      add constraint mystery_reward_pool_expires_days_ck
      check (expires_days is null or (expires_days between 1 and 365));
  end if;
end $$;

comment on column public.mystery_reward_pool.expires_days is
  'CP-140: how many days a reward won from this wedge stays claimable. '
  'NULL = the 30-day default. Expiry lands at the END of that day in the '
  'business''s local timezone, so "3" reads as a date, not a 72h stopwatch. '
  'Points prizes ignore this — points are banked instantly.';


-- ─── §2 — the business's local timezone ─────────────────────────────────────
-- Lives in the existing contact_info jsonb rather than a new column: the
-- builder already edits that bag (address / hours / phone), and a bad or
-- missing value can never raise — the join against pg_timezone_names drops
-- anything Postgres doesn't recognise and we fall back to Pacific, which is
-- where every live account is today.

create or replace function public.business_timezone(p_business_id uuid)
returns text
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(
    (select tz.name
       from public.businesses b
       join pg_timezone_names tz
         on tz.name = btrim(b.contact_info ->> 'timezone')
      where b.id = p_business_id
      limit 1),
    'America/Los_Angeles'
  );
$function$;

comment on function public.business_timezone(uuid) is
  'CP-140: the business''s IANA timezone from contact_info->>timezone, '
  'validated against pg_timezone_names; America/Los_Angeles when unset or '
  'unrecognised. Internal helper — not granted to clients.';


-- ─── §3 — day count → real expiry timestamp ─────────────────────────────────
-- "3 days" = today + 3, expiring at midnight at the END of that day, local.
-- Won Monday at 9pm with 3 days → good all of Tue, Wed and Thu. The customer
-- always gets at least the days promised, never a partial one.

create or replace function public.prize_expires_at(p_business_id uuid, p_days integer)
returns timestamptz
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_tz    text;
  v_days  integer;
  v_local date;
begin
  v_days := coalesce(p_days, 30);
  if v_days < 1   then v_days := 1;   end if;
  if v_days > 365 then v_days := 365; end if;

  v_tz    := public.business_timezone(p_business_id);
  v_local := (now() at time zone v_tz)::date;

  -- midnight starting day N+1, local → back to an absolute instant
  return ((v_local + (v_days + 1))::timestamp) at time zone v_tz;
end;
$function$;

comment on function public.prize_expires_at(uuid, integer) is
  'CP-140: end-of-day expiry N days out in the business''s local timezone. '
  'NULL days → 30. Internal helper — not granted to clients.';


-- ─── §4 — upsert_mystery_prize gains p_expires_days ─────────────────────────
-- Dropped and recreated rather than CREATE OR REPLACE'd: a trailing DEFAULT
-- argument creates an OVERLOAD, and PostgREST would then not know which of
-- the two to call from the builder.

drop function if exists public.upsert_mystery_prize(
  uuid, uuid, text, text, text, text, integer, uuid, text, integer, boolean);
-- ...and the CP-140 shape itself, so a re-run is a clean replace rather than
-- an "already exists with same argument types" failure.
drop function if exists public.upsert_mystery_prize(
  uuid, uuid, text, text, text, text, integer, uuid, text, integer, boolean, integer);

create function public.upsert_mystery_prize(
  p_id                uuid,
  p_business_id       uuid,
  p_prize_name        text,
  p_prize_description text    default null,
  p_prize_image_url   text    default null,
  p_kind              text    default 'points',
  p_points_amount     integer default null,
  p_reward_id         uuid    default null,
  p_coupon_code       text    default null,
  p_weight            integer default 10,
  p_is_active         boolean default true,
  p_expires_days      integer default null          -- CP-140
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id   uuid;
  v_days integer;
begin
  if not public.staffs_business(p_business_id) then raise exception 'permission denied'; end if;
  if p_kind not in ('points','reward','coupon') then raise exception 'invalid kind'; end if;

  -- CP-140: clamp rather than reject — a stray 0 or 9999 from the builder
  -- shouldn't lose the owner's whole prize edit. Points prizes never expire
  -- (they're banked the instant the wheel stops), so the window is dropped.
  v_days := p_expires_days;
  if v_days is not null then
    v_days := greatest(1, least(365, v_days));
  end if;
  if p_kind = 'points' then
    v_days := null;
  end if;

  if p_id is null then
    insert into public.mystery_reward_pool
      (business_id, prize_name, prize_description, prize_image_url, kind,
       points_amount, reward_id, coupon_code, weight, is_active, expires_days)
    values
      (p_business_id, p_prize_name, p_prize_description, p_prize_image_url, p_kind,
       p_points_amount, p_reward_id, p_coupon_code, p_weight, p_is_active, v_days)
    returning id into v_id;
  else
    update public.mystery_reward_pool set
      prize_name        = p_prize_name,
      prize_description = p_prize_description,
      prize_image_url   = p_prize_image_url,
      kind              = p_kind,
      points_amount     = p_points_amount,
      reward_id         = p_reward_id,
      coupon_code       = p_coupon_code,
      weight            = p_weight,
      is_active         = p_is_active,
      expires_days      = v_days
    where id = p_id and business_id = p_business_id
    returning id into v_id;
  end if;

  return v_id;
end;
$function$;


-- ─── §5 — spin_daily_reward honours the per-prize window ────────────────────
-- Dropped and recreated: RETURNS TABLE gains a trailing column, which
-- CREATE OR REPLACE cannot do.
--
-- The new OUT column is deliberately named `prize_expires_at`, NOT
-- `expires_at`: an OUT param sharing a name with a column of a table this
-- body writes to is exactly the collision that bit sign_waiver() in CP-137.

drop function if exists public.spin_daily_reward(uuid, uuid);

create function public.spin_daily_reward(p_business_id uuid, p_membership_id uuid)
returns table(
  prize_id          uuid,
  prize_name        text,
  prize_description text,
  prize_image_url   text,
  kind              text,
  points_amount     integer,
  coupon_code       text,
  new_balance       integer,
  prize_expires_at  timestamptz          -- CP-140
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_owner       uuid;
  v_checked_in  boolean;
  v_last        timestamptz;
  v_total_w     int;
  v_pick        int;
  v_cum         int := 0;
  v_pool        record;
  v_new_bal     int;
  v_demo        boolean;
  -- resolved prize (from pool OR default)
  v_prize_id    uuid;
  v_name        text;
  v_desc        text;
  v_img         text;
  v_kind        text;
  v_points      int;
  v_coupon      text := null;   -- coupons removed (CP-73); kept for API compat
  v_reward_id   uuid;
  v_r           float;
  v_exp_days    int  := null;   -- CP-140
  v_expires     timestamptz := null;
begin
  -- 1. Ownership.
  select bm.user_id into v_owner
    from public.business_memberships bm
   where bm.id = p_membership_id and bm.business_id = p_business_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not your membership' using errcode = '42501';
  end if;

  -- CP-68: demo apps skip the check-in + already-spun gates entirely.
  select coalesce(b.is_demo, false) into v_demo
    from public.businesses b where b.id = p_business_id;

  -- 2. Must have checked in today (skipped for demo apps).
  if not v_demo then
    select exists (
      select 1 from public.check_in_events ce
       where ce.membership_id = p_membership_id
         and ce.created_at >= date_trunc('day', now())
    ) into v_checked_in;
    if not v_checked_in then
      raise exception 'check in first to unlock your spin';
    end if;
  end if;

  -- 3. CP-73: one spin per day — in sync with the daily check-in.
  if not v_demo then
    perform 1 from public.business_memberships bm where bm.id = p_membership_id for update;
    select max(mrs.awarded_at) into v_last
      from public.mystery_reward_spins mrs
     where mrs.membership_id = p_membership_id;
    if v_last is not null and v_last >= date_trunc('day', now()) then
      raise exception 'already spun — come back after the cooldown';
    end if;
  end if;

  -- 4. Pick the prize (coupons excluded; CP-73.1: alias-qualified — the
  --    bare `kind` collided with this function's OUT column).
  select coalesce(sum(mrp.weight), 0) into v_total_w
    from public.mystery_reward_pool mrp
   where mrp.business_id = p_business_id
     and mrp.is_active
     and mrp.kind <> 'coupon';

  if v_total_w = 0 then
    -- No pool configured → built-in default point prizes (80/15/5).
    v_r := random();
    if v_r < 0.05 then v_points := 300; v_name := 'Jackpot — 300 points';
    elsif v_r < 0.20 then v_points := 100; v_name := 'Lucky — 100 points';
    else v_points := 50; v_name := 'Nice spin — 50 points'; end if;
    v_kind := 'points'; v_prize_id := null; v_desc := null; v_img := null; v_reward_id := null;
  else
    v_pick := floor(random() * v_total_w) + 1;
    for v_pool in
      select * from public.mystery_reward_pool mrp
       where mrp.business_id = p_business_id
         and mrp.is_active
         and mrp.kind <> 'coupon'
       order by mrp.created_at
    loop
      v_cum := v_cum + v_pool.weight;
      exit when v_cum >= v_pick;
    end loop;
    v_prize_id := v_pool.id;  v_name := v_pool.prize_name;  v_desc := v_pool.prize_description;
    v_img := v_pool.prize_image_url;  v_kind := v_pool.kind;  v_points := v_pool.points_amount;
    v_reward_id := v_pool.reward_id;
    v_exp_days := v_pool.expires_days;               -- CP-140

    -- CP-73.1: reward prizes reuse the reward's own photo on the reveal.
    if v_kind = 'reward' and v_img is null and v_reward_id is not null then
      select r.image_url into v_img from public.rewards r where r.id = v_reward_id;
    end if;
  end if;

  -- 5. Record the spin (prize_id may be null for default prizes).
  insert into public.mystery_reward_spins (business_id, membership_id, prize_id)
  values (p_business_id, p_membership_id, v_prize_id);

  -- 6. Award by kind.
  if v_kind = 'points' and coalesce(v_points, 0) > 0 then
    update public.business_memberships bm
       set points_balance         = bm.points_balance + v_points,
           lifetime_points_earned = bm.lifetime_points_earned + v_points,
           updated_at             = now()
     where bm.id = p_membership_id
     returning bm.points_balance into v_new_bal;
    insert into public.points_ledger
      (membership_id, business_id, delta, rule_type, notes, balance_after, created_by)
    values
      (p_membership_id, p_business_id, v_points, 'mystery_bonus',
       'Daily spin: ' || v_name, v_new_bal, auth.uid());
    perform public.recalc_tier(p_membership_id);
    -- points are banked instantly: nothing to expire.

  elsif v_kind = 'reward' and v_reward_id is not null then
    -- CP-140: was a hard-coded `now() + interval '30 days'`. The window now
    -- comes from the wedge, and lands at the end of that day locally.
    v_expires := public.prize_expires_at(p_business_id, v_exp_days);

    insert into public.redemptions
      (membership_id, reward_id, business_id, point_cost, code, status, expires_at)
    values
      (p_membership_id, v_reward_id, p_business_id, 0,
       public.generate_redemption_code(p_business_id), 'pending', v_expires);
    select bm.points_balance into v_new_bal from public.business_memberships bm where bm.id = p_membership_id;

  else
    select bm.points_balance into v_new_bal from public.business_memberships bm where bm.id = p_membership_id;
  end if;

  return query select v_prize_id, v_name, v_desc, v_img, v_kind, v_points, v_coupon, v_new_bal, v_expires;
end;
$function$;


-- ─── §6 — grants (CP-138 shape: authenticated only, never anon) ─────────────

do $$
declare
  v_has_service boolean := exists (select 1 from pg_roles where rolname = 'service_role');
begin
  -- Client-callable RPCs: signed-in users only.
  revoke all on function public.spin_daily_reward(uuid, uuid) from public;
  revoke all on function public.upsert_mystery_prize(
    uuid, uuid, text, text, text, text, integer, uuid, text, integer, boolean, integer) from public;

  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.spin_daily_reward(uuid, uuid) from anon;
    revoke all on function public.upsert_mystery_prize(
      uuid, uuid, text, text, text, text, integer, uuid, text, integer, boolean, integer) from anon;
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.spin_daily_reward(uuid, uuid) to authenticated;
    grant execute on function public.upsert_mystery_prize(
      uuid, uuid, text, text, text, text, integer, uuid, text, integer, boolean, integer) to authenticated;
  end if;

  if v_has_service then
    grant execute on function public.spin_daily_reward(uuid, uuid) to service_role;
    grant execute on function public.upsert_mystery_prize(
      uuid, uuid, text, text, text, text, integer, uuid, text, integer, boolean, integer) to service_role;
  end if;

  -- Internal helpers: called only from inside SECURITY DEFINER bodies, which
  -- run as the owner — no client ever needs EXECUTE on these.
  revoke all on function public.business_timezone(uuid) from public;
  revoke all on function public.prize_expires_at(uuid, integer) from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.business_timezone(uuid) from anon;
    revoke all on function public.prize_expires_at(uuid, integer) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.business_timezone(uuid) from authenticated;
    revoke all on function public.prize_expires_at(uuid, integer) from authenticated;
  end if;
end $$;

commit;


-- ─── §7 — verify (read-only; safe to run any time) ──────────────────────────
-- Expect: expires_days present; both helpers resolve; spin_daily_reward has
-- 9 output columns ending in prize_expires_at.
--
-- select column_name, data_type
--   from information_schema.columns
--  where table_schema = 'public' and table_name = 'mystery_reward_pool'
--    and column_name = 'expires_days';
--
-- select b.name,
--        public.business_timezone(b.id)              as tz,
--        public.prize_expires_at(b.id, 3)            as three_day_window,
--        public.prize_expires_at(b.id, null)         as default_window
--   from public.businesses b
--  where b.is_demo = false
--  order by b.created_at desc
--  limit 5;
--
-- select p.proname, pg_get_function_result(p.oid)
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public' and p.proname = 'spin_daily_reward';
