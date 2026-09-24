-- ============================================================================
-- CP-147 · Front-desk launch touches (Flippo's, Sun Sep 27 2026) + Booking v2
-- ----------------------------------------------------------------------------
-- Run in the Supabase SQL editor BEFORE deploying the CP-147 app build.
-- Self-contained and idempotent: safe to re-run. Apply after cp141/cp142.
--
-- PART A · DESK SOCIAL QUICK-AWARDS
--   The award panel's "Google Review" / "Instagram follow" / "Facebook follow"
--   tiles used to call quick_award(), which pays every tap (CP-140 only
--   guards a 5-second double-tap). A review or a follow is a ONCE-per-member
--   thing, so the desk now goes through desk_award_social(): it writes the
--   same `reviews` row the customer-submitted path writes (status
--   'verified', verification_method 'desk'), which means
--     · a second tap returns already=true and awards nothing,
--     · the customer's own app shows the reward as earned (my_review_status /
--       my_social_status read the same table),
--     · a customer who ALREADY submitted a pending review/follow gets that
--       row approved instead of a duplicate,
--     · points and note match approve_review() exactly (per-platform points
--       from social_config, else point_rules.social_follow; review from
--       point_rules.review).
--   member_social_awards() tells the panel which tiles are already earned so
--   they render as a green check instead of a button.
--
-- PART B · BOOKING v2 — resources with capacity (bays / lanes / cages / rooms)
--   CP-16's booking is ONE calendar: any overlapping booking blocks the slot.
--   Entertainment venues book a *resource* (batting cage #1-6, golf sim bay,
--   party room) that has N interchangeable units, for one of a few durations,
--   for a party. So:
--     booking_resources  — what can be booked; units = how many at once;
--                          durations = the lengths offered; hours per weekday
--                          (falls back to businesses.booking_hours); price /
--                          deposit are DISPLAY ONLY for now.
--     bookings           — gains resource_id, party_size, source, and the
--                          payment_* columns. Nothing charges yet: every
--                          booking is created payment_status 'none' or
--                          'due' (when the resource lists a deposit) and a
--                          future Stripe/Square adapter flips it to 'paid'
--                          through set_booking_payment(). See
--                          lib/booking.ts → BookingPaymentProvider.
--   Capacity is enforced INSIDE the transaction (advisory lock per resource),
--   so two customers can't take the last lane at the same second.
--   The legacy tag-based flow (create_booking / available_booking_slots) is
--   untouched; the app uses resources when a business has any, else tags.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- PART A · desk social quick-awards
-- ─────────────────────────────────────────────────────────────────────────

-- verification_method 'desk' = staff awarded it at the counter, no upload.
drop function if exists public.desk_award_social(uuid, text);
create function public.desk_award_social(p_membership_id uuid, p_platform text)
returns table (points_awarded int, new_balance int, already boolean, review_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  v_business_id uuid;
  v_existing    record;
  v_pts         int;
  v_rule        text;
  v_note        text;
  v_review_id   uuid;
  v_award       record;
  v_balance     int;
begin
  if p_platform not in ('google', 'instagram', 'facebook') then
    raise exception 'unknown platform %', p_platform;
  end if;

  select m.business_id into v_business_id
    from public.business_memberships m where m.id = p_membership_id;
  if v_business_id is null then raise exception 'membership not found'; end if;
  if not public.staffs_business(v_business_id) then raise exception 'permission denied'; end if;

  -- Serialize per member so a double-tap can't race past the check below.
  perform pg_advisory_xact_lock(hashtext('desk_social_' || p_membership_id::text));

  -- Already earned? Return the truth, award nothing.
  select r.id, r.status into v_existing
    from public.reviews r
   where r.membership_id = p_membership_id
     and r.platform = p_platform
     and r.status in ('pending', 'verified')
   order by case r.status when 'verified' then 0 else 1 end
   limit 1;

  select m.points_balance into v_balance from public.business_memberships m where m.id = p_membership_id;

  if v_existing.id is not null and v_existing.status = 'verified' then
    return query select 0, v_balance, true, v_existing.id;
    return;
  end if;

  -- Points + ledger note: identical to approve_review() (CP-134).
  if p_platform in ('instagram', 'facebook') then
    select coalesce(
             nullif((b.social_config -> p_platform ->> 'points')::int, 0),
             nullif((b.point_rules ->> 'social_follow')::int, 0),
             25)
      into v_pts from public.businesses b where b.id = v_business_id;
    v_rule := 'social_follow';
    v_note := initcap(p_platform) || ' follow verified at the desk';
  else
    select coalesce(nullif((b.point_rules ->> 'review')::int, 0), 5)
      into v_pts from public.businesses b where b.id = v_business_id;
    v_rule := 'review';
    v_note := 'Google review verified at the desk';
  end if;

  if v_existing.id is not null then
    -- A pending customer submission exists: approve THAT row (same as the queue).
    v_review_id := v_existing.id;
    update public.reviews r
       set status = 'verified', verified_at = now(), verified_by = auth.uid(),
           reward_issued_at = now()
     where r.id = v_review_id;
  else
    insert into public.reviews
      (membership_id, business_id, platform, status, verification_method, verification_data,
       verified_at, verified_by, reward_issued_at)
    values
      (p_membership_id, v_business_id, p_platform, 'verified', 'desk',
       jsonb_build_object('awarded_by', auth.uid()), now(), auth.uid(), now())
    returning id into v_review_id;
  end if;

  select * into v_award from public.award_points(
    p_membership_id, v_pts, v_rule, v_review_id, 'review_' || v_review_id::text, v_note
  );

  return query select v_pts, v_award.new_balance, false, v_review_id;
end; $$;
grant execute on function public.desk_award_social(uuid, text) to authenticated;

-- Which social tiles has this member already earned? (staff only)
drop function if exists public.member_social_awards(uuid);
create function public.member_social_awards(p_membership_id uuid)
returns table (platform text, status text, verified_at timestamptz)
language sql stable security definer set search_path = public as $$
  select distinct on (r.platform) r.platform, r.status, r.verified_at
    from public.reviews r
    join public.business_memberships m on m.id = r.membership_id
   where r.membership_id = p_membership_id
     and r.status in ('pending', 'verified')
     and public.staffs_business(m.business_id)
   order by r.platform, case r.status when 'verified' then 0 else 1 end;
$$;
grant execute on function public.member_social_awards(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- PART B · booking resources
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.booking_resources (
  id             uuid primary key default uuid_generate_v4(),
  business_id    uuid not null references public.businesses(id) on delete cascade,
  name           text not null,                       -- "Batting cage", "Golf sim bay", "Party room"
  description    text,
  emoji          text,
  image_url      text,
  units          int  not null default 1 check (units between 1 and 200),   -- how many can run at once
  unit_label     text not null default 'spot',        -- "cage", "bay", "lane", "room"
  durations      int[] not null default '{60}',       -- minutes offered
  slot_minutes   int  not null default 30 check (slot_minutes between 5 and 240), -- start-time step
  buffer_minutes int  not null default 0  check (buffer_minutes between 0 and 120), -- turnover
  max_party      int  not null default 8  check (max_party between 1 and 500),
  price_cents    int,                                  -- per booking, display only (v2)
  deposit_cents  int,                                  -- display only until a payment adapter lands
  /** {"1":[["10:00","22:00"]], ...} keyed by isodow 1=Mon..7=Sun; null → businesses.booking_hours */
  hours          jsonb,
  lead_minutes   int  not null default 30,             -- earliest start = now + lead
  horizon_days   int  not null default 30,             -- how far out customers may book
  is_active      boolean not null default true,
  sort_order     int  not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists booking_resources_business_idx
  on public.booking_resources(business_id, is_active, sort_order);
drop trigger if exists trg_booking_resources_updated on public.booking_resources;
create trigger trg_booking_resources_updated before update on public.booking_resources
  for each row execute function public.set_updated_at();

alter table public.booking_resources enable row level security;
do $$
begin
  begin drop policy "bres_public_read" on public.booking_resources; exception when undefined_object then null; end;
  begin drop policy "bres_staff_write" on public.booking_resources; exception when undefined_object then null; end;
end $$;
create policy "bres_public_read" on public.booking_resources for select to public
  using (is_active or public.staffs_business(business_id));
create policy "bres_staff_write" on public.booking_resources for all to authenticated
  using (public.staffs_business(business_id))
  with check (public.staffs_business(business_id));

-- bookings: resource + party + source + payment plumbing.
alter table public.bookings add column if not exists resource_id      uuid references public.booking_resources(id) on delete set null;
alter table public.bookings add column if not exists party_size       int not null default 1;
alter table public.bookings add column if not exists source           text not null default 'app';
alter table public.bookings add column if not exists amount_cents     int;
alter table public.bookings add column if not exists deposit_cents    int;
alter table public.bookings add column if not exists payment_status   text not null default 'none';
alter table public.bookings add column if not exists payment_provider text;
alter table public.bookings add column if not exists payment_ref      text;
alter table public.bookings add column if not exists paid_at          timestamptz;
alter table public.bookings add column if not exists created_by       uuid;
do $$
begin
  begin
    alter table public.bookings add constraint bookings_payment_status_chk
      check (payment_status in ('none','due','paid','refunded','failed'));
  exception when duplicate_object then null; end;
  begin
    alter table public.bookings add constraint bookings_source_chk
      check (source in ('app','desk','ghl','web'));
  exception when duplicate_object then null; end;
end $$;
create index if not exists bookings_resource_time_idx
  on public.bookings(resource_id, scheduled_at) where resource_id is not null;

-- ── resources: read / write ─────────────────────────────────────────────
drop function if exists public.list_booking_resources(uuid);
create function public.list_booking_resources(p_business_id uuid)
returns table (
  id uuid, name text, description text, emoji text, image_url text,
  units int, unit_label text, durations int[], slot_minutes int, buffer_minutes int,
  max_party int, price_cents int, deposit_cents int, hours jsonb,
  lead_minutes int, horizon_days int, is_active boolean, sort_order int
)
language sql stable security definer set search_path = public as $$
  select r.id, r.name, r.description, r.emoji, r.image_url,
         r.units, r.unit_label, r.durations, r.slot_minutes, r.buffer_minutes,
         r.max_party, r.price_cents, r.deposit_cents, r.hours,
         r.lead_minutes, r.horizon_days, r.is_active, r.sort_order
    from public.booking_resources r
   where r.business_id = p_business_id
     and (r.is_active or public.staffs_business(p_business_id))
   order by r.sort_order, r.created_at;
$$;
grant execute on function public.list_booking_resources(uuid) to anon, authenticated;

drop function if exists public.upsert_booking_resource(uuid, uuid, text, text, text, int, text, int[], int, int, int, int, int, jsonb, boolean, int);
create function public.upsert_booking_resource(
  p_id            uuid,
  p_business_id   uuid,
  p_name          text,
  p_description   text,
  p_emoji         text,
  p_units         int,
  p_unit_label    text,
  p_durations     int[],
  p_slot_minutes  int,
  p_buffer_minutes int,
  p_max_party     int,
  p_price_cents   int,
  p_deposit_cents int,
  p_hours         jsonb,
  p_is_active     boolean,
  p_sort_order    int
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.staffs_business(p_business_id) then raise exception 'permission denied'; end if;
  if coalesce(array_length(p_durations, 1), 0) = 0 then raise exception 'offer at least one duration'; end if;
  if p_id is null then
    insert into public.booking_resources
      (business_id, name, description, emoji, units, unit_label, durations, slot_minutes,
       buffer_minutes, max_party, price_cents, deposit_cents, hours, is_active, sort_order)
    values
      (p_business_id, p_name, p_description, p_emoji, coalesce(p_units, 1), coalesce(nullif(p_unit_label, ''), 'spot'),
       p_durations, coalesce(p_slot_minutes, 30), coalesce(p_buffer_minutes, 0), coalesce(p_max_party, 8),
       p_price_cents, p_deposit_cents, p_hours, coalesce(p_is_active, true), coalesce(p_sort_order, 0))
    returning id into v_id;
  else
    update public.booking_resources
       set name = p_name, description = p_description, emoji = p_emoji,
           units = coalesce(p_units, units), unit_label = coalesce(nullif(p_unit_label, ''), unit_label),
           durations = p_durations, slot_minutes = coalesce(p_slot_minutes, slot_minutes),
           buffer_minutes = coalesce(p_buffer_minutes, buffer_minutes), max_party = coalesce(p_max_party, max_party),
           price_cents = p_price_cents, deposit_cents = p_deposit_cents, hours = p_hours,
           is_active = coalesce(p_is_active, is_active), sort_order = coalesce(p_sort_order, sort_order)
     where id = p_id and business_id = p_business_id
    returning id into v_id;
  end if;
  return v_id;
end; $$;
grant execute on function public.upsert_booking_resource(uuid, uuid, text, text, text, int, text, int[], int, int, int, int, int, jsonb, boolean, int) to authenticated;

drop function if exists public.delete_booking_resource(uuid, uuid);
create function public.delete_booking_resource(p_id uuid, p_business_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.staffs_business(p_business_id) then raise exception 'permission denied'; end if;
  delete from public.booking_resources where id = p_id and business_id = p_business_id;
end; $$;
grant execute on function public.delete_booking_resource(uuid, uuid) to authenticated;

-- ── availability ────────────────────────────────────────────────────────
-- Opening windows for a resource on a weekday: the resource's own hours,
-- else the business's booking_hours. Returns (open_t, close_t) rows.
drop function if exists public.booking_resource_windows(uuid, int);
create function public.booking_resource_windows(p_resource_id uuid, p_isodow int)
returns table (open_t time, close_t time)
language plpgsql stable security definer set search_path = public as $$
declare
  v_hours  jsonb;
  v_bhours jsonb;
  v_days   jsonb;
begin
  select r.hours, b.booking_hours into v_hours, v_bhours
    from public.booking_resources r join public.businesses b on b.id = r.business_id
   where r.id = p_resource_id;
  if v_hours is not null and v_hours ? p_isodow::text then
    return query
      select (w->>0)::time, (w->>1)::time
        from jsonb_array_elements(v_hours -> p_isodow::text) w;
    return;
  end if;
  if v_hours is not null then
    return;  -- resource has its own schedule and this day is closed
  end if;
  v_days := coalesce(v_bhours -> 'days', '[1,2,3,4,5,6,7]'::jsonb);
  if exists (select 1 from jsonb_array_elements_text(v_days) d where d::int = p_isodow) then
    return query select coalesce((v_bhours->>'start')::time, '09:00'::time),
                        coalesce((v_bhours->>'end')::time,   '21:00'::time);
  end if;
end; $$;
grant execute on function public.booking_resource_windows(uuid, int) to anon, authenticated;

-- Start times on a day with how many units are still free for that length.
drop function if exists public.booking_resource_slots(uuid, date, int);
create function public.booking_resource_slots(p_resource_id uuid, p_day date, p_duration int)
returns table (slot_start timestamptz, slot_end timestamptz, units_left int)
language plpgsql stable security definer set search_path = public as $$
declare
  v_r        record;
  v_tz       text;
  v_win      record;
  v_cursor   timestamptz;
  v_close    timestamptz;
  v_end      timestamptz;
  v_earliest timestamptz;
  v_busy     int;
begin
  select * into v_r from public.booking_resources where id = p_resource_id and is_active;
  if v_r.id is null then return; end if;
  if not (p_duration = any(v_r.durations)) then raise exception 'that length is not offered'; end if;
  v_tz := public.business_timezone(v_r.business_id);
  v_earliest := now() + (v_r.lead_minutes || ' minutes')::interval;
  if p_day > (now() at time zone v_tz)::date + v_r.horizon_days then return; end if;

  for v_win in select * from public.booking_resource_windows(p_resource_id, extract(isodow from p_day)::int) loop
    v_cursor := (p_day::text || ' ' || v_win.open_t::text)::timestamp at time zone v_tz;
    v_close  := (p_day::text || ' ' || v_win.close_t::text)::timestamp at time zone v_tz;
    while v_cursor + (p_duration || ' minutes')::interval <= v_close loop
      v_end := v_cursor + (p_duration || ' minutes')::interval;
      if v_cursor >= v_earliest then
        select count(*) into v_busy
          from public.bookings b
         where b.resource_id = p_resource_id
           and b.status in ('pending', 'confirmed')
           and b.scheduled_at < v_end + (v_r.buffer_minutes || ' minutes')::interval
           and b.scheduled_end + (v_r.buffer_minutes || ' minutes')::interval > v_cursor;
        slot_start := v_cursor; slot_end := v_end; units_left := greatest(0, v_r.units - v_busy);
        return next;
      end if;
      v_cursor := v_cursor + (v_r.slot_minutes || ' minutes')::interval;
    end loop;
  end loop;
end; $$;
grant execute on function public.booking_resource_slots(uuid, date, int) to anon, authenticated;

-- ── create ──────────────────────────────────────────────────────────────
-- Shared core: capacity check under an advisory lock, then insert.
drop function if exists public.booking_resource_reserve(uuid, timestamptz, int, int, uuid, uuid, text, text, text, text, text);
create function public.booking_resource_reserve(
  p_resource_id uuid, p_starts_at timestamptz, p_duration int, p_party int,
  p_user uuid, p_membership uuid, p_name text, p_phone text, p_email text, p_notes text, p_source text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_r     record;
  v_end   timestamptz;
  v_busy  int;
  v_id    uuid;
  v_pay   text;
begin
  select * into v_r from public.booking_resources where id = p_resource_id;
  if v_r.id is null then raise exception 'resource not found'; end if;
  if not v_r.is_active and p_source <> 'desk' then raise exception 'this is not bookable right now'; end if;
  if not (p_duration = any(v_r.durations)) then raise exception 'that length is not offered'; end if;
  if coalesce(p_party, 1) < 1 or p_party > v_r.max_party then
    raise exception 'party size must be between 1 and %', v_r.max_party;
  end if;
  if p_source <> 'desk' and p_starts_at < now() + (v_r.lead_minutes || ' minutes')::interval then
    raise exception 'that start time is too soon — pick a later slot';
  end if;
  v_end := p_starts_at + (p_duration || ' minutes')::interval;

  perform pg_advisory_xact_lock(hashtext('booking_resource_' || p_resource_id::text));
  select count(*) into v_busy
    from public.bookings b
   where b.resource_id = p_resource_id
     and b.status in ('pending', 'confirmed')
     and b.scheduled_at < v_end + (v_r.buffer_minutes || ' minutes')::interval
     and b.scheduled_end + (v_r.buffer_minutes || ' minutes')::interval > p_starts_at;
  if v_busy >= v_r.units then raise exception 'that time just filled up — pick another slot'; end if;

  v_pay := case when coalesce(v_r.deposit_cents, 0) > 0 then 'due' else 'none' end;

  insert into public.bookings
    (business_id, membership_id, user_id, resource_id, tag_id, tag_name, duration_minutes,
     scheduled_at, party_size, customer_name, customer_phone, customer_email, notes,
     status, source, amount_cents, deposit_cents, payment_status, created_by)
  values
    (v_r.business_id, p_membership, p_user, p_resource_id, null, v_r.name, p_duration,
     p_starts_at, coalesce(p_party, 1), p_name, p_phone, p_email, p_notes,
     case when p_source = 'desk' then 'confirmed' else 'pending' end,
     p_source, v_r.price_cents, v_r.deposit_cents, v_pay, auth.uid())
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.booking_resource_reserve(uuid, timestamptz, int, int, uuid, uuid, text, text, text, text, text) from public;

-- Customer books for themselves (must be a member of the business).
drop function if exists public.book_resource(uuid, timestamptz, int, int, text, text, text, text);
create function public.book_resource(
  p_resource_id uuid, p_starts_at timestamptz, p_duration int, p_party int,
  p_name text default null, p_phone text default null, p_email text default null, p_notes text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_biz uuid; v_mem uuid; v_name text; v_phone text; v_email text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select business_id into v_biz from public.booking_resources where id = p_resource_id;
  select m.id, p.full_name, p.phone, p.email::text into v_mem, v_name, v_phone, v_email
    from public.business_memberships m join public.profiles p on p.id = m.user_id
   where m.business_id = v_biz and m.user_id = auth.uid();
  if v_mem is null then raise exception 'join this business in the app before booking'; end if;
  return public.booking_resource_reserve(
    p_resource_id, p_starts_at, p_duration, p_party, auth.uid(), v_mem,
    coalesce(nullif(p_name, ''), v_name), coalesce(nullif(p_phone, ''), v_phone),
    coalesce(nullif(p_email, ''), v_email), p_notes, 'app');
end; $$;
grant execute on function public.book_resource(uuid, timestamptz, int, int, text, text, text, text) to authenticated;

-- Front desk books a walk-in / phone caller (optionally attached to a member).
drop function if exists public.desk_book_resource(uuid, timestamptz, int, int, uuid, text, text, text, text);
create function public.desk_book_resource(
  p_resource_id uuid, p_starts_at timestamptz, p_duration int, p_party int,
  p_membership_id uuid default null, p_name text default null, p_phone text default null,
  p_email text default null, p_notes text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_biz uuid; v_user uuid; v_name text; v_phone text; v_email text;
begin
  select business_id into v_biz from public.booking_resources where id = p_resource_id;
  if v_biz is null or not public.staffs_business(v_biz) then raise exception 'permission denied'; end if;
  if p_membership_id is not null then
    select m.user_id, p.full_name, p.phone, p.email::text into v_user, v_name, v_phone, v_email
      from public.business_memberships m join public.profiles p on p.id = m.user_id
     where m.id = p_membership_id and m.business_id = v_biz;
    if v_user is null then raise exception 'member not found at this business'; end if;
  end if;
  if coalesce(nullif(p_name, ''), v_name) is null then raise exception 'a name is required'; end if;
  return public.booking_resource_reserve(
    p_resource_id, p_starts_at, p_duration, p_party, v_user, p_membership_id,
    coalesce(nullif(p_name, ''), v_name), coalesce(nullif(p_phone, ''), v_phone),
    coalesce(nullif(p_email, ''), v_email), p_notes, 'desk');
end; $$;
grant execute on function public.desk_book_resource(uuid, timestamptz, int, int, uuid, text, text, text, text) to authenticated;

-- ── read / manage ───────────────────────────────────────────────────────
drop function if exists public.list_resource_bookings(uuid, timestamptz, timestamptz);
create function public.list_resource_bookings(p_business_id uuid, p_from timestamptz, p_to timestamptz)
returns table (
  id uuid, resource_id uuid, resource_name text, unit_label text,
  scheduled_at timestamptz, scheduled_end timestamptz, duration_minutes int, party_size int,
  status text, source text, payment_status text, amount_cents int, deposit_cents int,
  customer_name text, customer_phone text, customer_email text, notes text,
  membership_id uuid, created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select b.id, b.resource_id, coalesce(r.name, b.tag_name), coalesce(r.unit_label, 'spot'),
         b.scheduled_at, b.scheduled_end, b.duration_minutes, b.party_size,
         b.status, b.source, b.payment_status, b.amount_cents, b.deposit_cents,
         b.customer_name, b.customer_phone, b.customer_email, b.notes,
         b.membership_id, b.created_at
    from public.bookings b
    left join public.booking_resources r on r.id = b.resource_id
   where b.business_id = p_business_id
     and b.scheduled_at >= p_from and b.scheduled_at < p_to
     and public.staffs_business(p_business_id)
   order by b.scheduled_at asc;
$$;
grant execute on function public.list_resource_bookings(uuid, timestamptz, timestamptz) to authenticated;

-- Customer: their own upcoming + recent bookings at this business.
drop function if exists public.my_bookings(uuid);
create function public.my_bookings(p_business_id uuid)
returns table (
  id uuid, resource_name text, emoji text, scheduled_at timestamptz, scheduled_end timestamptz,
  duration_minutes int, party_size int, status text, payment_status text, deposit_cents int, notes text
)
language sql stable security definer set search_path = public as $$
  select b.id, coalesce(r.name, b.tag_name), r.emoji, b.scheduled_at, b.scheduled_end,
         b.duration_minutes, b.party_size, b.status, b.payment_status, b.deposit_cents, b.notes
    from public.bookings b
    left join public.booking_resources r on r.id = b.resource_id
   where b.business_id = p_business_id
     and b.user_id = auth.uid()
     and b.scheduled_at > now() - interval '30 days'
   order by b.scheduled_at desc;
$$;
grant execute on function public.my_bookings(uuid) to authenticated;

drop function if exists public.cancel_my_booking(uuid);
create function public.cancel_my_booking(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.bookings
     set status = 'cancelled', cancelled_at = now(), cancelled_reason = 'customer cancelled in app'
   where id = p_id and user_id = auth.uid()
     and status in ('pending', 'confirmed')
     and scheduled_at > now();
  if not found then raise exception 'this booking can no longer be cancelled here — call the venue'; end if;
end; $$;
grant execute on function public.cancel_my_booking(uuid) to authenticated;

-- Payment adapter hook (server-side only). A future Stripe/Square webhook
-- route calls this with the service role after a successful charge.
drop function if exists public.set_booking_payment(uuid, text, text, text, int);
create function public.set_booking_payment(p_id uuid, p_status text, p_provider text, p_ref text, p_amount_cents int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('none','due','paid','refunded','failed') then raise exception 'invalid payment status'; end if;
  update public.bookings
     set payment_status = p_status, payment_provider = p_provider, payment_ref = p_ref,
         amount_cents = coalesce(p_amount_cents, amount_cents),
         paid_at = case when p_status = 'paid' then now() else paid_at end,
         status = case when p_status = 'paid' and status = 'pending' then 'confirmed' else status end,
         confirmed_at = case when p_status = 'paid' and status = 'pending' then now() else confirmed_at end
   where id = p_id;
end; $$;
revoke all on function public.set_booking_payment(uuid, text, text, text, int) from public;
grant execute on function public.set_booking_payment(uuid, text, text, text, int) to service_role;

-- ── verify ──────────────────────────────────────────────────────────────
-- select * from public.list_booking_resources('<business uuid>');
-- select * from public.booking_resource_slots('<resource uuid>', current_date + 1, 60);
