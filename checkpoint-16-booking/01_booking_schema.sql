-- =====================================================================
-- CHECKPOINT 16 — Booking system (tag → slot flow)
-- =====================================================================
-- Customer flow: tap service widget → tap available time slot → confirm.
-- Manager flow: define service widgets (booking_tags) + see/manage upcoming
-- bookings. Every booking change fires through the existing outbound
-- webhook infrastructure so GHL gets notified automatically.
-- =====================================================================

-- ----- 1. Per-business booking hours config -----
alter table public.businesses
  add column if not exists booking_hours jsonb not null default
    '{"start":"09:00","end":"19:00","slot_minutes":15,"days":[1,2,3,4,5,6]}'::jsonb;
-- days uses ISO weekday numbers (1=Mon..7=Sun). Default = Mon-Sat.

-- ----- 2. booking_tags  (the service "widgets" the customer sees) -----
create table if not exists public.booking_tags (
  id                uuid primary key default uuid_generate_v4(),
  business_id       uuid not null references public.businesses(id) on delete cascade,
  name              text not null,
  description       text,
  emoji             text,
  duration_minutes  int  not null check (duration_minutes > 0 and duration_minutes <= 8 * 60),
  price_cents       int,
  color             text,                 -- optional hex like '#6366f1'
  is_active         boolean not null default true,
  sort_order        int     not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists booking_tags_business_idx
  on public.booking_tags(business_id, is_active, sort_order);

alter table public.booking_tags enable row level security;

do $$
begin
  begin drop policy "btags_public_read" on public.booking_tags; exception when undefined_object then null; end;
  begin drop policy "btags_staff_write" on public.booking_tags; exception when undefined_object then null; end;
end $$;

create policy "btags_public_read" on public.booking_tags for select to public
  using (is_active or public.staffs_business(business_id));
create policy "btags_staff_write" on public.booking_tags for all to authenticated
  using (public.staffs_business(business_id))
  with check (public.staffs_business(business_id));

-- ----- 3. bookings  (one row per reservation) -----
create table if not exists public.bookings (
  id                uuid primary key default uuid_generate_v4(),
  business_id       uuid not null references public.businesses(id) on delete cascade,
  membership_id     uuid references public.business_memberships(id) on delete set null,
  user_id           uuid references auth.users(id) on delete set null,
  tag_id            uuid references public.booking_tags(id) on delete set null,
  -- snapshots so we can render the booking even if the tag was deleted later
  tag_name          text not null,
  duration_minutes  int  not null,
  scheduled_at      timestamptz not null,
  -- scheduled_end is auto-maintained by trg_set_booking_end below (we can't
  -- use a STORED GENERATED column because `timestamptz + interval` is STABLE
  -- not IMMUTABLE per Postgres — generation expressions require IMMUTABLE).
  scheduled_end     timestamptz,
  customer_name     text,
  customer_phone    text,
  customer_email    text,
  notes             text,
  status            text not null default 'pending'
                    check (status in ('pending','confirmed','completed','cancelled','no_show')),
  cancelled_reason  text,
  confirmed_at      timestamptz,
  completed_at      timestamptz,
  cancelled_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Trigger that keeps scheduled_end in sync with scheduled_at + duration_minutes.
create or replace function public.set_booking_scheduled_end()
returns trigger language plpgsql as $$
begin
  new.scheduled_end := new.scheduled_at + (new.duration_minutes::text || ' minutes')::interval;
  return new;
end; $$;

drop trigger if exists trg_set_booking_end on public.bookings;
create trigger trg_set_booking_end
  before insert or update of scheduled_at, duration_minutes
  on public.bookings
  for each row execute function public.set_booking_scheduled_end();
create index if not exists bookings_business_time_idx
  on public.bookings(business_id, scheduled_at);
create index if not exists bookings_member_idx
  on public.bookings(membership_id, scheduled_at desc);

-- updated_at trigger
drop trigger if exists trg_bookings_updated on public.bookings;
create trigger trg_bookings_updated before update on public.bookings
  for each row execute function public.set_updated_at();

alter table public.bookings enable row level security;

do $$
begin
  begin drop policy "bookings_self_read"   on public.bookings; exception when undefined_object then null; end;
  begin drop policy "bookings_staff_read"  on public.bookings; exception when undefined_object then null; end;
  begin drop policy "bookings_self_insert" on public.bookings; exception when undefined_object then null; end;
  begin drop policy "bookings_staff_write" on public.bookings; exception when undefined_object then null; end;
end $$;

create policy "bookings_self_read"  on public.bookings for select to authenticated
  using (user_id = auth.uid() or public.staffs_business(business_id));
create policy "bookings_staff_write" on public.bookings for all to authenticated
  using (public.staffs_business(business_id))
  with check (public.staffs_business(business_id));
-- inserts by the customer go through the create_booking RPC (security definer)

-- ----- 4. RPCs: booking_tags CRUD -----
create or replace function public.upsert_booking_tag(
  p_id               uuid,
  p_business_id      uuid,
  p_name             text,
  p_duration_minutes int,
  p_description      text   default null,
  p_emoji            text   default null,
  p_price_cents      int    default null,
  p_color            text   default null,
  p_is_active        boolean default true,
  p_sort_order       int    default 0
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.staffs_business(p_business_id) then raise exception 'permission denied'; end if;
  if p_id is null then
    insert into public.booking_tags
      (business_id, name, description, emoji, duration_minutes, price_cents, color, is_active, sort_order)
    values
      (p_business_id, p_name, p_description, p_emoji, p_duration_minutes, p_price_cents, p_color, p_is_active, p_sort_order)
    returning id into v_id;
  else
    update public.booking_tags
       set name = p_name, description = p_description, emoji = p_emoji,
           duration_minutes = p_duration_minutes, price_cents = p_price_cents,
           color = p_color, is_active = p_is_active, sort_order = p_sort_order,
           updated_at = now()
     where id = p_id and business_id = p_business_id
    returning id into v_id;
  end if;
  return v_id;
end; $$;
grant execute on function public.upsert_booking_tag(uuid, uuid, text, int, text, text, int, text, boolean, int) to authenticated;

create or replace function public.delete_booking_tag(p_id uuid, p_business_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.staffs_business(p_business_id) then raise exception 'permission denied'; end if;
  delete from public.booking_tags where id = p_id and business_id = p_business_id;
end; $$;
grant execute on function public.delete_booking_tag(uuid, uuid) to authenticated;

-- ----- 5. Public reader: active tags for a business -----
create or replace function public.active_booking_tags(p_business_id uuid)
returns table (id uuid, name text, description text, emoji text, duration_minutes int, price_cents int, color text)
language sql stable security definer set search_path = public as $$
  select id, name, description, emoji, duration_minutes, price_cents, color
    from public.booking_tags
   where business_id = p_business_id and is_active
   order by sort_order, created_at;
$$;
grant execute on function public.active_booking_tags(uuid) to anon, authenticated;

-- ----- 6. Available slots for a tag on a given day -----
-- Returns timestamptz slots, in business local time terms, excluding ones
-- that would overlap with an existing booking.
create or replace function public.available_booking_slots(
  p_business_id uuid,
  p_tag_id      uuid,
  p_day         date
)
returns table (slot_start timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  v_hours    jsonb;
  v_start_t  time;
  v_end_t    time;
  v_step     int;
  v_dur      int;
  v_dow      int;
  v_dow_ok   boolean;
  v_cursor   timestamptz;
  v_end_ts   timestamptz;
  v_slot_end timestamptz;
begin
  select booking_hours into v_hours from public.businesses where id = p_business_id;
  v_start_t := (v_hours->>'start')::time;
  v_end_t   := (v_hours->>'end')::time;
  v_step    := coalesce((v_hours->>'slot_minutes')::int, 15);
  v_dow     := extract(isodow from p_day)::int;
  v_dow_ok  := exists (
    select 1 from jsonb_array_elements_text(v_hours->'days') d
     where d::int = v_dow
  );
  if not v_dow_ok then
    return;
  end if;

  select duration_minutes into v_dur
    from public.booking_tags
   where id = p_tag_id and business_id = p_business_id;
  if v_dur is null then
    raise exception 'tag not found for this business';
  end if;

  v_cursor := (p_day::text || ' ' || v_start_t::text)::timestamptz;
  v_end_ts := (p_day::text || ' ' || v_end_t::text)::timestamptz;

  while v_cursor + (v_dur || ' minutes')::interval <= v_end_ts loop
    v_slot_end := v_cursor + (v_dur || ' minutes')::interval;
    -- Skip past slots (today before now())
    if v_cursor > now() then
      -- Conflict check
      if not exists (
        select 1 from public.bookings b
         where b.business_id = p_business_id
           and b.status in ('pending','confirmed')
           and b.scheduled_at      <  v_slot_end
           and b.scheduled_end     >  v_cursor
      ) then
        slot_start := v_cursor;
        return next;
      end if;
    end if;
    v_cursor := v_cursor + (v_step || ' minutes')::interval;
  end loop;
end; $$;
grant execute on function public.available_booking_slots(uuid, uuid, date) to anon, authenticated;

-- ----- 7. create_booking: customer-callable -----
create or replace function public.create_booking(
  p_business_id    uuid,
  p_tag_id         uuid,                 -- nullable for "Other" bookings
  p_scheduled_at   timestamptz,
  p_duration       int    default null,  -- only used when tag is null
  p_name           text   default null,
  p_phone          text   default null,
  p_email          text   default null,
  p_notes          text   default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_tag        record;
  v_dur        int;
  v_tag_name   text;
  v_user       uuid := auth.uid();
  v_membership uuid;
  v_id         uuid;
  v_slot_end   timestamptz;
begin
  -- Resolve tag info
  if p_tag_id is not null then
    select * into v_tag from public.booking_tags
     where id = p_tag_id and business_id = p_business_id and is_active;
    if v_tag is null then
      raise exception 'service is not available';
    end if;
    v_dur := v_tag.duration_minutes;
    v_tag_name := v_tag.name;
  else
    if coalesce(p_duration, 0) <= 0 then
      raise exception 'duration is required when no service is selected';
    end if;
    v_dur := p_duration;
    v_tag_name := 'Other';
  end if;

  v_slot_end := p_scheduled_at + (v_dur || ' minutes')::interval;

  -- Conflict check (server-side defense — UI also filters)
  if exists (
    select 1 from public.bookings b
     where b.business_id = p_business_id
       and b.status in ('pending','confirmed')
       and b.scheduled_at  <  v_slot_end
       and b.scheduled_end >  p_scheduled_at
  ) then
    raise exception 'that slot is no longer available';
  end if;

  if v_user is not null then
    select id into v_membership from public.business_memberships
     where user_id = v_user and business_id = p_business_id;
  end if;

  insert into public.bookings
    (business_id, membership_id, user_id, tag_id, tag_name, duration_minutes,
     scheduled_at, customer_name, customer_phone, customer_email, notes, status)
  values
    (p_business_id, v_membership, v_user, p_tag_id, v_tag_name, v_dur,
     p_scheduled_at, p_name, p_phone, p_email, p_notes, 'pending')
  returning id into v_id;

  return v_id;
end; $$;
grant execute on function public.create_booking(uuid, uuid, timestamptz, int, text, text, text, text) to authenticated;

-- ----- 8. update_booking_status: manager-only (confirm/complete/cancel) -----
create or replace function public.update_booking_status(
  p_id      uuid,
  p_status  text,
  p_reason  text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare v_biz uuid;
begin
  select business_id into v_biz from public.bookings where id = p_id;
  if v_biz is null or not public.staffs_business(v_biz) then
    raise exception 'permission denied';
  end if;
  if p_status not in ('pending','confirmed','completed','cancelled','no_show') then
    raise exception 'invalid status';
  end if;
  update public.bookings
     set status = p_status,
         confirmed_at = case when p_status = 'confirmed' then now() else confirmed_at end,
         completed_at = case when p_status = 'completed' then now() else completed_at end,
         cancelled_at = case when p_status = 'cancelled' then now() else cancelled_at end,
         cancelled_reason = case when p_status = 'cancelled' then p_reason else cancelled_reason end
   where id = p_id;
end; $$;
grant execute on function public.update_booking_status(uuid, text, text) to authenticated;

-- ----- 9. Outbound webhook dispatch on booking lifecycle -----
create or replace function public.dispatch_booking_webhooks()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_ep      record;
  v_event   text;
  v_payload jsonb;
  v_req_id  bigint;
begin
  if (tg_op = 'INSERT') then
    v_event := 'booking.created';
  else
    if old.status = new.status then
      return new;
    end if;
    v_event := case new.status
      when 'confirmed' then 'booking.confirmed'
      when 'completed' then 'booking.completed'
      when 'cancelled' then 'booking.cancelled'
      when 'no_show'   then 'booking.no_show'
      else 'booking.updated'
    end;
  end if;

  v_payload := jsonb_build_object(
    'event',            v_event,
    'business_id',      new.business_id,
    'booking_id',       new.id,
    'membership_id',    new.membership_id,
    'tag_id',           new.tag_id,
    'tag_name',         new.tag_name,
    'duration_minutes', new.duration_minutes,
    'scheduled_at',     new.scheduled_at,
    'customer_name',    new.customer_name,
    'customer_phone',   new.customer_phone,
    'customer_email',   new.customer_email,
    'status',           new.status,
    'notes',            new.notes,
    'occurred_at',      now()
  );

  for v_ep in
    select * from public.webhook_endpoints
     where business_id = new.business_id
       and is_active
       and (v_event = any(events) or 'all' = any(events))
  loop
    begin
      select net.http_post(
        url := v_ep.url,
        body := v_payload,
        headers := jsonb_build_object(
          'Content-Type',     'application/json',
          'X-Atlas-Signature', encode(hmac(v_payload::text, v_ep.secret, 'sha256'), 'hex'),
          'X-Atlas-Event',     v_event
        )
      ) into v_req_id;

      insert into public.webhook_deliveries
        (business_id, endpoint_id, direction, event_type, url, payload, request_id)
      values
        (new.business_id, v_ep.id, 'outbound', v_event, v_ep.url, v_payload, v_req_id);
    exception when others then
      insert into public.webhook_deliveries
        (business_id, endpoint_id, direction, event_type, url, payload, error)
      values
        (new.business_id, v_ep.id, 'outbound', v_event, v_ep.url, v_payload, sqlerrm);
    end;
  end loop;

  return new;
end; $$;

drop trigger if exists trg_dispatch_booking on public.bookings;
create trigger trg_dispatch_booking
  after insert or update of status on public.bookings
  for each row execute function public.dispatch_booking_webhooks();

-- ----- 10. Manager helpers -----
create or replace function public.list_bookings(
  p_business_id uuid,
  p_from        timestamptz default now() - interval '1 day',
  p_to          timestamptz default now() + interval '60 days'
)
returns table (
  id uuid, tag_id uuid, tag_name text, duration_minutes int,
  scheduled_at timestamptz, status text,
  customer_name text, customer_phone text, customer_email text, notes text
)
language sql stable security definer set search_path = public as $$
  select id, tag_id, tag_name, duration_minutes, scheduled_at, status,
         customer_name, customer_phone, customer_email, notes
    from public.bookings
   where business_id = p_business_id
     and scheduled_at >= p_from and scheduled_at < p_to
   order by scheduled_at asc;
$$;
grant execute on function public.list_bookings(uuid, timestamptz, timestamptz) to authenticated;
