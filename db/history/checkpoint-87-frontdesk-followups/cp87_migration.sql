-- =====================================================================
-- CP-87 — Front-desk PIN hotfix, prize-only rewards, notification
--          coalescing support, qualified referrals
-- =====================================================================
-- Self-contained + idempotent. Apply AFTER cp86_migration.sql.
--
--   1. PIN HOTFIX — "function crypt(text, text) does not exist".
--      On Supabase, pgcrypto lives in the `extensions` schema; the CP-49
--      PIN RPCs pinned search_path to `public` only, so crypt()/gen_salt()
--      were invisible. Recreate the two crypto-touching RPCs with
--      search_path = public, extensions (works whether pgcrypto is in
--      public OR extensions).
--
--   2. PRIZE-ONLY REWARDS — rewards.show_in_store. A reward used only as
--      a wheel prize / streak gift / offer gift no longer has to appear
--      in the customer reward store. Admin pickers still list everything;
--      customer store surfaces + "reward unlocked" notifications filter.
--
--   3. QUALIFIED REFERRALS — no more link-farming. A referral now starts
--      PENDING: the new member must spend a configurable minimum
--      (point_rules.referral_min_spend_cents, default $20) before BOTH
--      parties get their points. Spend accrues automatically from
--      purchase events; both ends can watch progress. Set the minimum to
--      $0 to restore instant payouts.
-- =====================================================================


-- =====================================================================
-- 1. FRONT-DESK PIN HOTFIX (crypt not found)
-- =====================================================================
-- Make sure pgcrypto exists somewhere sane (no-op if already installed).
do $$ begin
  create extension if not exists pgcrypto with schema extensions;
exception when others then
  begin
    create extension if not exists pgcrypto with schema public;
  exception when others then null; end;
end $$;

create or replace function public.set_front_desk_pin(
  p_business_id uuid,
  p_user_id     uuid,
  p_display_name text,
  p_pin         text
)
returns void language plpgsql security definer
set search_path = public, extensions as $$
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

create or replace function public.verify_front_desk_pin(
  p_business_id uuid,
  p_pin         text
)
returns table (
  user_id uuid,
  ok      boolean,
  locked  boolean
)
language plpgsql security definer
set search_path = public, extensions as $$
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
-- 2. PRIZE-ONLY REWARDS (show_in_store)
-- =====================================================================
alter table public.rewards
  add column if not exists show_in_store boolean not null default true;

-- upsert_reward gains p_show_in_store (drop the CP-42 10-arg signature
-- so the new one resolves cleanly; old named-arg callers still match
-- because the new arg has a default).
drop function if exists public.upsert_reward(uuid, uuid, text, text, text, int, text, boolean, int, text);

create or replace function public.upsert_reward(
  p_id            uuid,
  p_business_id   uuid,
  p_name          text,
  p_description   text default null,
  p_reward_type   text default 'discount',
  p_point_cost    int  default 500,
  p_image_url     text default null,
  p_is_active     boolean default true,
  p_sort_order    int default 0,
  p_category      text default null,
  p_show_in_store boolean default true   -- CP-87: false = prize-only (wheel/streak/offers)
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.staffs_business(p_business_id) then raise exception 'permission denied'; end if;

  if p_id is null then
    insert into public.rewards
      (business_id, name, description, reward_type, point_cost,
       image_url, is_active, sort_order, category, show_in_store)
    values
      (p_business_id, p_name, p_description, p_reward_type, p_point_cost,
       p_image_url, p_is_active, p_sort_order, p_category, coalesce(p_show_in_store, true))
    returning id into v_id;
  else
    update public.rewards
       set name          = p_name,
           description   = p_description,
           reward_type   = p_reward_type,
           point_cost    = p_point_cost,
           image_url     = p_image_url,
           is_active     = p_is_active,
           sort_order    = p_sort_order,
           category      = p_category,
           show_in_store = coalesce(p_show_in_store, true),
           updated_at    = now()
     where id = p_id and business_id = p_business_id
    returning id into v_id;
  end if;

  return v_id;
end; $$;
grant execute on function public.upsert_reward(uuid, uuid, text, text, text, int, text, boolean, int, text, boolean)
  to authenticated;

-- Customer Home "Top rewards" respects the flag.
create or replace function public.top_rewards_public(p_business_id uuid, p_limit int default 4)
returns table (id uuid, name text, point_cost int, image_url text)
language sql stable security definer set search_path = public as $$
  select id, name, point_cost, image_url
    from public.rewards
   where business_id = p_business_id
     and is_active
     and coalesce(show_in_store, true)
   order by sort_order, point_cost asc
   limit p_limit;
$$;
grant execute on function public.top_rewards_public(uuid, int) to anon, authenticated;


-- =====================================================================
-- 3. QUALIFIED REFERRALS (friend must spend $X before payout)
-- =====================================================================

-- 3-pre. Re-assert the CP-44.1 ledger fix (this DB missed several old
-- migrations): balance_after becomes nullable and auto-fills via trigger,
-- so inline ledger credits (win-back, referrals) can't fail on NOT NULL.
alter table public.points_ledger
  alter column balance_after drop not null;

create or replace function public.points_ledger_fill_balance()
returns trigger
language plpgsql
as $$
begin
  if new.balance_after is null then
    new.balance_after := coalesce(
      (select points_balance
         from public.business_memberships
        where id = new.membership_id), 0
    ) + coalesce(new.delta, 0);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_points_ledger_fill_balance on public.points_ledger;
create trigger trg_points_ledger_fill_balance
  before insert on public.points_ledger
  for each row
  execute function public.points_ledger_fill_balance();

-- 3a. Schema: progress columns + 'pending' status + multi-referral fix.
alter table public.referrals
  add column if not exists qualifying_spend_cents int not null default 0,
  add column if not exists min_spend_cents        int;

do $$ begin
  alter table public.referrals drop constraint if exists referrals_status_check;
  alter table public.referrals add constraint referrals_status_check
    check (status in ('sent','signed_up','pending','completed','expired'));
end $$;

-- CP-01 made (business_id, code) UNIQUE — but every referee a referrer
-- brings in shares the SAME code, so a referrer could only ever refer ONE
-- person before hitting a duplicate-key error. Replace with non-unique.
drop index if exists referrals_code_idx;
create index if not exists referrals_business_code_idx
  on public.referrals(business_id, code);
create index if not exists referrals_referee_pending_idx
  on public.referrals(referee_membership_id) where status = 'pending';

-- 3b. complete_referral — awards BOTH parties (inline credit, no
-- award_points auth gate — this can fire from triggers/webhooks) and
-- drops a bell notification on each end. Idempotent via status guard.
create or replace function public.complete_referral(p_referral_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r              record;
  v_pts_referrer int;
  v_pts_referee  int;
  v_biz_name     text;
begin
  select * into r from public.referrals where id = p_referral_id for update;
  if not found or r.status not in ('pending','signed_up') then return; end if;

  select coalesce((point_rules->>'referral_referrer')::int, 0),
         coalesce((point_rules->>'referral_referee')::int, 0),
         name
    into v_pts_referrer, v_pts_referee, v_biz_name
    from public.businesses where id = r.business_id;

  -- Referrer credit (inline — mirrors send_winback's pattern).
  if v_pts_referrer > 0 and r.referrer_membership_id is not null then
    insert into public.points_ledger
      (business_id, membership_id, delta, rule_type, reference_id, idempotency_key, notes)
    values
      (r.business_id, r.referrer_membership_id, v_pts_referrer, 'referral_referrer',
       r.id, 'ref_r_' || r.id::text, 'Referred a friend who qualified')
    on conflict do nothing;
    update public.business_memberships
       set points_balance         = points_balance + v_pts_referrer,
           lifetime_points_earned = lifetime_points_earned + v_pts_referrer
     where id = r.referrer_membership_id;
  end if;

  -- Referee credit.
  if v_pts_referee > 0 and r.referee_membership_id is not null then
    insert into public.points_ledger
      (business_id, membership_id, delta, rule_type, reference_id, idempotency_key, notes)
    values
      (r.business_id, r.referee_membership_id, v_pts_referee, 'referral_referee',
       r.id, 'ref_e_' || r.id::text, 'Referral bonus unlocked')
    on conflict do nothing;
    update public.business_memberships
       set points_balance         = points_balance + v_pts_referee,
           lifetime_points_earned = lifetime_points_earned + v_pts_referee
     where id = r.referee_membership_id;
  end if;

  update public.referrals
     set status = 'completed', completed_at = now(), reward_issued_at = now()
   where id = r.id;

  -- Bell notifications for both ends (best effort).
  begin
    insert into public.notifications (user_id, business_id, kind, title, body, link_path)
    select m.user_id, r.business_id, 'generic',
           'Referral bonus unlocked! 🎉',
           'Your friend qualified — +' || v_pts_referrer || ' points added at ' || coalesce(v_biz_name, 'your spot') || '.',
           '/app'
      from public.business_memberships m
     where m.id = r.referrer_membership_id and v_pts_referrer > 0;

    insert into public.notifications (user_id, business_id, kind, title, body, link_path)
    select m.user_id, r.business_id, 'generic',
           'Referral bonus unlocked! 🎉',
           '+' || v_pts_referee || ' points added — thanks for coming in!',
           '/app'
      from public.business_memberships m
     where m.id = r.referee_membership_id and v_pts_referee > 0;
  exception when others then null;
  end;
end; $$;
revoke all on function public.complete_referral(uuid) from public, anon, authenticated;
grant execute on function public.complete_referral(uuid) to service_role;

-- 3c. Spend tracker — every purchase event moves the referee's pending
-- referral forward; crossing the line completes it.
create or replace function public.referral_track_spend()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  if new.event_type is distinct from 'purchase'
     or coalesce(new.amount_cents, 0) <= 0
     or new.membership_id is null then
    return new;
  end if;

  for r in
    select id, qualifying_spend_cents, min_spend_cents
      from public.referrals
     where referee_membership_id = new.membership_id
       and business_id = new.business_id
       and status = 'pending'
     for update
  loop
    update public.referrals
       set qualifying_spend_cents = r.qualifying_spend_cents + new.amount_cents
     where id = r.id;
    if r.qualifying_spend_cents + new.amount_cents >= coalesce(r.min_spend_cents, 2000) then
      perform public.complete_referral(r.id);
    end if;
  end loop;

  return new;
end; $$;

drop trigger if exists trg_referral_track_spend on public.events;
create trigger trg_referral_track_spend
  after insert on public.events
  for each row execute function public.referral_track_spend();

-- 3d. process_referral v2 — same signature + return shape as CP-06, but
-- the referral now starts PENDING (no instant points) unless the business
-- sets referral_min_spend_cents to 0. The threshold is snapshotted on the
-- row so changing the setting later doesn't move goalposts mid-referral.
create or replace function public.process_referral(
  p_referrer_code  text,
  p_business_id    uuid
)
returns table (referral_id uuid, referrer_points int, referee_points int)
language plpgsql security definer set search_path = public as $$
declare
  v_referrer_mem  uuid;
  v_referee_mem   uuid;
  v_referee_uid   uuid := auth.uid();
  v_referral_id   uuid;
  v_pts_referrer  int;
  v_pts_referee   int;
  v_min_spend     int;
begin
  if v_referee_uid is null then
    raise exception 'not authenticated';
  end if;

  select id into v_referrer_mem
    from public.business_memberships
   where referral_code = upper(p_referrer_code)
     and business_id = p_business_id;
  if v_referrer_mem is null then
    raise exception 'referral code "%s" not found at this business', p_referrer_code;
  end if;

  select id into v_referee_mem
    from public.business_memberships
   where user_id = v_referee_uid and business_id = p_business_id;
  if v_referee_mem is null then
    raise exception 'you are not enrolled yet — try again in a moment';
  end if;

  if v_referrer_mem = v_referee_mem then
    raise exception 'cannot use your own referral code';
  end if;

  if exists (
    select 1 from public.referrals
     where referee_membership_id = v_referee_mem
       and business_id = p_business_id
  ) then
    raise exception 'this account was already referred';
  end if;

  select coalesce((point_rules->>'referral_referrer')::int, 0),
         coalesce((point_rules->>'referral_referee')::int, 0),
         coalesce((point_rules->>'referral_min_spend_cents')::int, 2000)
    into v_pts_referrer, v_pts_referee, v_min_spend
    from public.businesses where id = p_business_id;

  if v_min_spend <= 0 then
    -- Instant mode (the pre-CP-87 behavior, opt-in via $0 threshold).
    insert into public.referrals
      (business_id, referrer_membership_id, referee_user_id, referee_membership_id,
       code, status, signed_up_at, completed_at, reward_issued_at, min_spend_cents)
    values
      (p_business_id, v_referrer_mem, v_referee_uid, v_referee_mem,
       upper(p_referrer_code), 'completed', now(), now(), now(), 0)
    returning id into v_referral_id;

    if v_pts_referrer > 0 then
      insert into public.points_ledger
        (business_id, membership_id, delta, rule_type, reference_id, idempotency_key, notes)
      values (p_business_id, v_referrer_mem, v_pts_referrer, 'referral_referrer',
              v_referral_id, 'ref_r_' || v_referral_id::text, 'Referred a new member')
      on conflict do nothing;
      update public.business_memberships
         set points_balance = points_balance + v_pts_referrer,
             lifetime_points_earned = lifetime_points_earned + v_pts_referrer
       where id = v_referrer_mem;
    end if;
    if v_pts_referee > 0 then
      insert into public.points_ledger
        (business_id, membership_id, delta, rule_type, reference_id, idempotency_key, notes)
      values (p_business_id, v_referee_mem, v_pts_referee, 'referral_referee',
              v_referral_id, 'ref_e_' || v_referral_id::text, 'Welcome (referral bonus)')
      on conflict do nothing;
      update public.business_memberships
         set points_balance = points_balance + v_pts_referee,
             lifetime_points_earned = lifetime_points_earned + v_pts_referee
       where id = v_referee_mem;
    end if;

    return query select v_referral_id, v_pts_referrer, v_pts_referee;
    return;
  end if;

  -- Qualified mode: park it as PENDING; the events trigger completes it
  -- once the friend's purchases reach the threshold. No points yet.
  insert into public.referrals
    (business_id, referrer_membership_id, referee_user_id, referee_membership_id,
     code, status, signed_up_at, min_spend_cents, qualifying_spend_cents)
  values
    (p_business_id, v_referrer_mem, v_referee_uid, v_referee_mem,
     upper(p_referrer_code), 'pending', now(), v_min_spend, 0)
  returning id into v_referral_id;

  return query select v_referral_id, 0, 0;
end; $$;
grant execute on function public.process_referral(text, uuid) to authenticated;

-- 3e. my_referrals v2 — adds progress fields for the referrer's list
-- (return type changed → drop first).
drop function if exists public.my_referrals(uuid);
create function public.my_referrals(p_business_id uuid)
returns table (
  id uuid, code text, status text,
  referee_name text, referee_email text,
  created_at timestamptz, completed_at timestamptz,
  spend_cents int, min_spend_cents int
)
language sql stable security definer set search_path = public as $$
  select r.id, r.code, r.status,
         coalesce(p.full_name, split_part(p.email::text, '@', 1)) as referee_name,
         p.email::text,
         r.created_at, r.completed_at,
         r.qualifying_spend_cents,
         coalesce(r.min_spend_cents, 2000)
    from public.referrals r
    join public.business_memberships m on m.id = r.referrer_membership_id
    left join public.profiles p on p.id = r.referee_user_id
   where m.user_id = auth.uid()
     and r.business_id = p_business_id
   order by r.created_at desc;
$$;
grant execute on function public.my_referrals(uuid) to authenticated;

-- 3f. my_referral_progress — the REFEREE's own pending referral, for the
-- "spend $X more to unlock your bonus" card in their app.
create or replace function public.my_referral_progress(p_business_id uuid)
returns table (
  referral_id     uuid,
  status          text,
  spend_cents     int,
  min_spend_cents int,
  referee_points  int,
  referrer_name   text
)
language sql stable security definer set search_path = public as $$
  select r.id, r.status,
         r.qualifying_spend_cents,
         coalesce(r.min_spend_cents, 2000),
         coalesce((b.point_rules->>'referral_referee')::int, 0),
         coalesce(nullif(btrim(rp.full_name), ''), 'your friend')
    from public.referrals r
    join public.business_memberships m  on m.id = r.referee_membership_id
    join public.businesses b            on b.id = r.business_id
    left join public.business_memberships rm on rm.id = r.referrer_membership_id
    left join public.profiles rp             on rp.id = rm.user_id
   where m.user_id = auth.uid()
     and r.business_id = p_business_id
     and r.status = 'pending'
   order by r.created_at desc
   limit 1;
$$;
grant execute on function public.my_referral_progress(uuid) to authenticated;


-- =====================================================================
-- Refresh PostgREST.
-- =====================================================================
notify pgrst, 'reload schema';

-- =====================================================================
-- Verification:
--   -- crypt reachable from the PIN RPC (should return a row, not error):
--   select public.verify_front_desk_pin('00000000-0000-0000-0000-000000000000'::uuid, '0000');  -- run as service role
--   select proname from pg_proc where proname in
--     ('complete_referral','referral_track_spend','my_referral_progress');  -- 3 rows
--   select column_name from information_schema.columns
--    where table_name='rewards' and column_name='show_in_store';            -- 1 row
-- =====================================================================
