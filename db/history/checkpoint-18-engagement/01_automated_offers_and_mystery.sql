-- =====================================================================
-- CHECKPOINT 18 (part 1) — Automated seasonal offers + Mystery Rewards
-- =====================================================================
-- Goal: turn Atlas into a proactive retention engine. Two pillars here:
--   1. Automated Offers — system-seeded "occasions" (Birthday, Halloween,
--      St. Valentine's, etc.) that businesses can toggle on, then customize
--      the headline + discount. A daily cron RPC fires them.
--   2. Mystery Reward — surprise spin-to-win. Each business defines a prize
--      pool with weights; members get one spin per cooldown period.
-- =====================================================================

-- ----- 1. System-wide library of seasonal offer templates -----
create table if not exists public.automated_offer_templates (
  id            uuid primary key default uuid_generate_v4(),
  slug          text unique not null,
  name          text not null,
  emoji         text,
  description   text,
  default_image_url text,
  -- Trigger model: "date" fires on a fixed MM-DD; "birthday" and "anniversary"
  -- fire per-customer; "signup" fires on the day they join; "inactivity" fires
  -- after N days of no visits (config holds {days:14}).
  trigger_type  text not null check (trigger_type in ('date','birthday','anniversary','signup','inactivity')),
  trigger_config jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

-- Seed the templates (idempotent)
insert into public.automated_offer_templates
  (slug, name, emoji, description, trigger_type, trigger_config)
values
  ('birthday',       'Birthday Special', '🎁', 'Surprise gift to customers on their birthday.',          'birthday',     '{}'::jsonb),
  ('anniversary',    'Client Anniversary','🥳', 'Celebrate the day they joined — every year.',           'anniversary',  '{}'::jsonb),
  ('welcome',        'Welcome Gift',     '✨', 'Lands the moment a new member signs up.',                'signup',       '{}'::jsonb),
  ('comeback',       'Come Back & Save', '👋', 'Auto-fires when a member hasn''t visited in 14+ days.',  'inactivity',   '{"days":14}'::jsonb),
  ('halloween',      'Halloween',        '🎃', 'Spooky promo around October 31.',                       'date',         '{"month":10,"day":31,"window_days":7}'::jsonb),
  ('valentines',     'St. Valentine''s Day','💗', 'Show some love around Feb 14.',                       'date',         '{"month":2,"day":14,"window_days":3}'::jsonb),
  ('new_years',      'New Years',        '🎉', 'Kick off the new year with a special offer.',            'date',         '{"month":1,"day":1,"window_days":7}'::jsonb),
  ('easter',         'Easter Special',   '🐣', 'Holiday hop around Easter weekend.',                     'date',         '{"month":4,"day":1,"window_days":14}'::jsonb),
  ('black_friday',   'Black Friday',     '🛍️', 'Biggest deal day of the year.',                          'date',         '{"month":11,"day":29,"window_days":4}'::jsonb),
  ('christmas',      'Christmas',        '🎄', 'End-of-year gift to your members.',                      'date',         '{"month":12,"day":25,"window_days":10}'::jsonb),
  ('summer_kickoff', 'Summer Kickoff',   '☀️', 'Welcome summer with a seasonal promo.',                  'date',         '{"month":6,"day":21,"window_days":10}'::jsonb)
on conflict (slug) do update set
  name = excluded.name,
  emoji = excluded.emoji,
  description = excluded.description,
  trigger_type = excluded.trigger_type,
  trigger_config = excluded.trigger_config;

alter table public.automated_offer_templates enable row level security;
do $$ begin
  begin drop policy "offer_templates_public_read" on public.automated_offer_templates;
  exception when undefined_object then null; end;
end $$;
create policy "offer_templates_public_read" on public.automated_offer_templates for select to public using (true);

-- ----- 2. Per-business activation + customization -----
create table if not exists public.business_automated_offers (
  id                  uuid primary key default uuid_generate_v4(),
  business_id         uuid not null references public.businesses(id) on delete cascade,
  template_id         uuid not null references public.automated_offer_templates(id) on delete cascade,
  is_active           boolean not null default false,
  custom_title        text,            -- e.g. "NAME, happy birthday!"
  custom_description  text,            -- e.g. "We got you a little gift!"
  custom_image_url    text,
  -- Discount: agency can set a coupon-style offer this template ships with.
  discount_type       text check (discount_type in ('none','percent','flat_cents','points_bonus')),
  discount_value      int,             -- meaning depends on discount_type
  expires_after_days  int default 7,   -- how long the auto-created offer stays live
  last_triggered_at   timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (business_id, template_id)
);
create index if not exists biz_auto_offers_business_idx on public.business_automated_offers(business_id, is_active);

drop trigger if exists trg_biz_auto_offers_updated on public.business_automated_offers;
create trigger trg_biz_auto_offers_updated before update on public.business_automated_offers
  for each row execute function public.set_updated_at();

alter table public.business_automated_offers enable row level security;
do $$ begin
  begin drop policy "biz_auto_offers_staff" on public.business_automated_offers;
  exception when undefined_object then null; end;
end $$;
create policy "biz_auto_offers_staff" on public.business_automated_offers for all to authenticated
  using (public.staffs_business(business_id))
  with check (public.staffs_business(business_id));

-- ----- 3. RPC: upsert business automated offer -----
create or replace function public.upsert_business_automated_offer(
  p_id                  uuid,
  p_business_id         uuid,
  p_template_id         uuid,
  p_is_active           boolean,
  p_custom_title        text default null,
  p_custom_description  text default null,
  p_custom_image_url    text default null,
  p_discount_type       text default 'none',
  p_discount_value      int  default null,
  p_expires_after_days  int  default 7
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.staffs_business(p_business_id) then raise exception 'permission denied'; end if;
  if p_id is null then
    insert into public.business_automated_offers
      (business_id, template_id, is_active, custom_title, custom_description,
       custom_image_url, discount_type, discount_value, expires_after_days)
    values
      (p_business_id, p_template_id, p_is_active, p_custom_title, p_custom_description,
       p_custom_image_url, p_discount_type, p_discount_value, p_expires_after_days)
    on conflict (business_id, template_id) do update set
       is_active          = excluded.is_active,
       custom_title       = excluded.custom_title,
       custom_description = excluded.custom_description,
       custom_image_url   = excluded.custom_image_url,
       discount_type      = excluded.discount_type,
       discount_value     = excluded.discount_value,
       expires_after_days = excluded.expires_after_days,
       updated_at         = now()
    returning id into v_id;
  else
    update public.business_automated_offers set
       is_active          = p_is_active,
       custom_title       = p_custom_title,
       custom_description = p_custom_description,
       custom_image_url   = p_custom_image_url,
       discount_type      = p_discount_type,
       discount_value     = p_discount_value,
       expires_after_days = p_expires_after_days,
       updated_at         = now()
    where id = p_id and business_id = p_business_id
    returning id into v_id;
  end if;
  return v_id;
end; $$;
grant execute on function public.upsert_business_automated_offer(uuid, uuid, uuid, boolean, text, text, text, text, int, int) to authenticated;

-- ----- 4. List templates with this business's overrides -----
create or replace function public.list_automated_offers_for_business(p_business_id uuid)
returns table (
  template_id uuid, slug text, name text, emoji text, description text,
  trigger_type text, trigger_config jsonb,
  config_id uuid, is_active boolean,
  custom_title text, custom_description text, custom_image_url text,
  discount_type text, discount_value int,
  last_triggered_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select t.id, t.slug, t.name, t.emoji, t.description,
         t.trigger_type, t.trigger_config,
         o.id, coalesce(o.is_active, false),
         o.custom_title, o.custom_description, o.custom_image_url,
         coalesce(o.discount_type, 'none'), o.discount_value,
         o.last_triggered_at
    from public.automated_offer_templates t
    left join public.business_automated_offers o
      on o.template_id = t.id and o.business_id = p_business_id
   order by case
     when t.trigger_type = 'birthday'    then 1
     when t.trigger_type = 'anniversary' then 2
     when t.trigger_type = 'signup'      then 3
     when t.trigger_type = 'inactivity'  then 4
     else 9
   end, t.name;
$$;
grant execute on function public.list_automated_offers_for_business(uuid) to authenticated;

-- ----- 5. Cron RPC: fire date-based templates that are due today -----
-- Called daily from outside (Supabase scheduled function, or a cron service
-- hitting `select trigger_automated_offers()`). Creates rows in offers
-- table so they show up on the customer Home tab.
create or replace function public.trigger_automated_offers()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_row    record;
  v_today  date := current_date;
  v_month  int  := extract(month from v_today)::int;
  v_day    int  := extract(day from v_today)::int;
  v_window int;
  v_diff   int;
  v_count  int  := 0;
  v_expires_at timestamptz;
begin
  for v_row in
    select o.id as config_id, o.business_id, o.custom_title, o.custom_description,
           o.custom_image_url, o.discount_type, o.discount_value, o.expires_after_days,
           o.last_triggered_at,
           t.slug, t.name, t.emoji, t.trigger_type, t.trigger_config
      from public.business_automated_offers o
      join public.automated_offer_templates t on t.id = o.template_id
     where o.is_active and t.trigger_type = 'date'
  loop
    v_window := coalesce((v_row.trigger_config->>'window_days')::int, 0);
    -- Distance in days between today and the trigger date (this year).
    v_diff := abs(v_today - make_date(extract(year from v_today)::int,
                                       (v_row.trigger_config->>'month')::int,
                                       (v_row.trigger_config->>'day')::int));
    if v_diff <= v_window then
      -- Avoid double-firing the same template within 30 days.
      if v_row.last_triggered_at is null or v_row.last_triggered_at < (now() - interval '30 days') then
        v_expires_at := now() + (coalesce(v_row.expires_after_days, 7) || ' days')::interval;
        insert into public.offers
          (business_id, title, description, image_url, expires_at, is_active, is_featured)
        values
          (v_row.business_id,
           coalesce(v_row.custom_title, v_row.emoji || ' ' || v_row.name),
           v_row.custom_description,
           v_row.custom_image_url,
           v_expires_at,
           true,
           true)
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

-- =====================================================================
-- MYSTERY REWARDS
-- =====================================================================

-- ----- 6. Per-business config (cooldown / enabled) -----
create table if not exists public.business_mystery_config (
  business_id   uuid primary key references public.businesses(id) on delete cascade,
  is_enabled    boolean not null default false,
  cooldown_hours int not null default 24,
  updated_at    timestamptz not null default now()
);
alter table public.business_mystery_config enable row level security;
do $$ begin
  begin drop policy "mystery_cfg_public_read" on public.business_mystery_config; exception when undefined_object then null; end;
  begin drop policy "mystery_cfg_staff_write" on public.business_mystery_config; exception when undefined_object then null; end;
end $$;
create policy "mystery_cfg_public_read" on public.business_mystery_config for select to public using (true);
create policy "mystery_cfg_staff_write" on public.business_mystery_config for all to authenticated
  using (public.staffs_business(business_id))
  with check (public.staffs_business(business_id));

-- ----- 7. Prize pool -----
create table if not exists public.mystery_reward_pool (
  id            uuid primary key default uuid_generate_v4(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  prize_name    text not null,
  prize_description text,
  prize_image_url   text,
  kind          text not null check (kind in ('points','reward','coupon')),
  points_amount int,
  reward_id     uuid references public.rewards(id) on delete set null,
  coupon_code   text,
  weight        int not null default 10 check (weight >= 1),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists mystery_pool_biz_idx on public.mystery_reward_pool(business_id, is_active, weight);

alter table public.mystery_reward_pool enable row level security;
do $$ begin
  begin drop policy "mystery_pool_public_read" on public.mystery_reward_pool; exception when undefined_object then null; end;
  begin drop policy "mystery_pool_staff_write" on public.mystery_reward_pool; exception when undefined_object then null; end;
end $$;
create policy "mystery_pool_public_read" on public.mystery_reward_pool for select to public using (is_active);
create policy "mystery_pool_staff_write" on public.mystery_reward_pool for all to authenticated
  using (public.staffs_business(business_id))
  with check (public.staffs_business(business_id));

-- ----- 8. Spin ledger -----
create table if not exists public.mystery_reward_spins (
  id              uuid primary key default uuid_generate_v4(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  membership_id   uuid not null references public.business_memberships(id) on delete cascade,
  prize_id        uuid not null references public.mystery_reward_pool(id) on delete restrict,
  awarded_at      timestamptz not null default now()
);
create index if not exists mystery_spins_member_idx on public.mystery_reward_spins(membership_id, awarded_at desc);

alter table public.mystery_reward_spins enable row level security;
do $$ begin
  begin drop policy "mystery_spins_self"  on public.mystery_reward_spins; exception when undefined_object then null; end;
  begin drop policy "mystery_spins_staff" on public.mystery_reward_spins; exception when undefined_object then null; end;
end $$;
create policy "mystery_spins_self" on public.mystery_reward_spins for select to authenticated
  using (exists (select 1 from public.business_memberships m where m.id = membership_id and m.user_id = auth.uid()));
create policy "mystery_spins_staff" on public.mystery_reward_spins for select to authenticated
  using (public.staffs_business(business_id));

-- ----- 9. RPC: status — when can this member spin again? -----
create or replace function public.mystery_reward_status(
  p_business_id   uuid,
  p_membership_id uuid
)
returns table (is_available boolean, next_spin_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  v_enabled       boolean;
  v_cooldown_h    int;
  v_last_spin     timestamptz;
  v_pool_count    int;
begin
  select coalesce(is_enabled, false), coalesce(cooldown_hours, 24)
    into v_enabled, v_cooldown_h
    from public.business_mystery_config
   where business_id = p_business_id;

  -- If config row missing or disabled, no widget.
  if not coalesce(v_enabled, false) then
    is_available := false;
    next_spin_at := null;
    return next; return;
  end if;

  -- Must have at least one active prize in the pool.
  select count(*) into v_pool_count
    from public.mystery_reward_pool
   where business_id = p_business_id and is_active;
  if v_pool_count = 0 then
    is_available := false;
    next_spin_at := null;
    return next; return;
  end if;

  select max(awarded_at) into v_last_spin
    from public.mystery_reward_spins
   where membership_id = p_membership_id;

  if v_last_spin is null or v_last_spin < now() - (v_cooldown_h || ' hours')::interval then
    is_available := true;
    next_spin_at := null;
  else
    is_available := false;
    next_spin_at := v_last_spin + (v_cooldown_h || ' hours')::interval;
  end if;
  return next;
end; $$;
grant execute on function public.mystery_reward_status(uuid, uuid) to authenticated;

-- ----- 10. RPC: spin — weighted random pick + ledger insert + (if points) award -----
create or replace function public.spin_mystery_reward(
  p_business_id   uuid,
  p_membership_id uuid
)
returns table (
  prize_name text,
  prize_description text,
  points_awarded int,
  reward_id uuid
)
language plpgsql security definer set search_path = public as $$
declare
  v_ok_to_spin   boolean;
  v_total_weight int;
  v_pick         int;
  v_running      int := 0;
  v_chosen       record;
begin
  -- Re-check eligibility (defense)
  select is_available into v_ok_to_spin
    from public.mystery_reward_status(p_business_id, p_membership_id);
  if not coalesce(v_ok_to_spin, false) then
    raise exception 'mystery reward not available right now';
  end if;

  -- Ensure caller actually owns this membership OR is staff
  if not (
    exists (select 1 from public.business_memberships
            where id = p_membership_id and user_id = auth.uid())
    or public.staffs_business(p_business_id)
  ) then
    raise exception 'permission denied';
  end if;

  -- Pull total weight + roll
  select coalesce(sum(weight), 0) into v_total_weight
    from public.mystery_reward_pool
   where business_id = p_business_id and is_active;
  if v_total_weight = 0 then
    raise exception 'no active prizes in pool';
  end if;
  v_pick := floor(random() * v_total_weight)::int + 1;

  -- Walk the pool deterministically (ordered) to find the bucket.
  for v_chosen in
    select id, prize_name, prize_description, kind, points_amount, reward_id, weight
      from public.mystery_reward_pool
     where business_id = p_business_id and is_active
     order by id
  loop
    v_running := v_running + v_chosen.weight;
    if v_pick <= v_running then exit; end if;
  end loop;

  -- Record the spin
  insert into public.mystery_reward_spins (business_id, membership_id, prize_id)
  values (p_business_id, p_membership_id, v_chosen.id);

  -- If it's a points prize, also award them immediately via ledger.
  if v_chosen.kind = 'points' and coalesce(v_chosen.points_amount, 0) > 0 then
    insert into public.points_ledger
      (business_id, membership_id, delta, rule_type, notes)
    values
      (p_business_id, p_membership_id, v_chosen.points_amount, 'mystery_reward',
       'Mystery reward: ' || v_chosen.prize_name);

    -- bump balance + lifetime_points
    update public.business_memberships
       set points_balance       = points_balance + v_chosen.points_amount,
           lifetime_points_earned = lifetime_points_earned + v_chosen.points_amount
     where id = p_membership_id;
  end if;

  prize_name        := v_chosen.prize_name;
  prize_description := v_chosen.prize_description;
  points_awarded    := case when v_chosen.kind = 'points' then v_chosen.points_amount else null end;
  reward_id         := v_chosen.reward_id;
  return next;
end; $$;
grant execute on function public.spin_mystery_reward(uuid, uuid) to authenticated;

-- ----- 11. RPC: pool CRUD for managers -----
create or replace function public.upsert_mystery_prize(
  p_id           uuid,
  p_business_id  uuid,
  p_prize_name   text,
  p_prize_description text default null,
  p_prize_image_url text default null,
  p_kind         text default 'points',
  p_points_amount int default null,
  p_reward_id    uuid default null,
  p_coupon_code  text default null,
  p_weight       int default 10,
  p_is_active    boolean default true
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.staffs_business(p_business_id) then raise exception 'permission denied'; end if;
  if p_kind not in ('points','reward','coupon') then raise exception 'invalid kind'; end if;

  if p_id is null then
    insert into public.mystery_reward_pool
      (business_id, prize_name, prize_description, prize_image_url, kind,
       points_amount, reward_id, coupon_code, weight, is_active)
    values
      (p_business_id, p_prize_name, p_prize_description, p_prize_image_url, p_kind,
       p_points_amount, p_reward_id, p_coupon_code, p_weight, p_is_active)
    returning id into v_id;
  else
    update public.mystery_reward_pool set
      prize_name = p_prize_name,
      prize_description = p_prize_description,
      prize_image_url   = p_prize_image_url,
      kind          = p_kind,
      points_amount = p_points_amount,
      reward_id     = p_reward_id,
      coupon_code   = p_coupon_code,
      weight        = p_weight,
      is_active     = p_is_active
    where id = p_id and business_id = p_business_id
    returning id into v_id;
  end if;
  return v_id;
end; $$;
grant execute on function public.upsert_mystery_prize(uuid, uuid, text, text, text, text, int, uuid, text, int, boolean) to authenticated;

create or replace function public.delete_mystery_prize(p_id uuid, p_business_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.staffs_business(p_business_id) then raise exception 'permission denied'; end if;
  delete from public.mystery_reward_pool where id = p_id and business_id = p_business_id;
end; $$;
grant execute on function public.delete_mystery_prize(uuid, uuid) to authenticated;
