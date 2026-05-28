-- =====================================================================
-- CHECKPOINT 17 — GHL Calendar integration + booking tag images
-- =====================================================================
-- Adds:
--   • image_url on booking_tags so each "service widget" can have a hero
--     photo (e.g. each batting cage tile).
--   • GHL config fields on businesses so each sub-account can point at
--     its own GHL location + calendar. GHL becomes source-of-truth for
--     availability and double-booking prevention; Supabase mirrors.
--   • Public reader that includes image_url (active_booking_tags v2).
--   • list_busy_slots(): returns occupied ranges for a day so the UI
--     can render "Reserved" tiles alongside open slots.
-- =====================================================================

-- ----- 1. Booking tag images -----
alter table public.booking_tags
  add column if not exists image_url text;

-- ----- 2. GHL config on each business -----
alter table public.businesses
  add column if not exists ghl_location_id  text,
  add column if not exists ghl_calendar_id  text,
  add column if not exists ghl_api_key      text;
-- ghl_api_key is a per-location private integration token. RLS already
-- restricts businesses table reads to staff, so this stays scoped.

-- ----- 3. Replace upsert_booking_tag with an image-aware version -----
create or replace function public.upsert_booking_tag(
  p_id               uuid,
  p_business_id      uuid,
  p_name             text,
  p_duration_minutes int,
  p_description      text    default null,
  p_emoji            text    default null,
  p_price_cents      int     default null,
  p_color            text    default null,
  p_is_active        boolean default true,
  p_sort_order       int     default 0,
  p_image_url        text    default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.staffs_business(p_business_id) then raise exception 'permission denied'; end if;
  if p_id is null then
    insert into public.booking_tags
      (business_id, name, description, emoji, duration_minutes, price_cents,
       color, is_active, sort_order, image_url)
    values
      (p_business_id, p_name, p_description, p_emoji, p_duration_minutes, p_price_cents,
       p_color, p_is_active, p_sort_order, p_image_url)
    returning id into v_id;
  else
    update public.booking_tags
       set name = p_name, description = p_description, emoji = p_emoji,
           duration_minutes = p_duration_minutes, price_cents = p_price_cents,
           color = p_color, is_active = p_is_active, sort_order = p_sort_order,
           image_url = p_image_url,
           updated_at = now()
     where id = p_id and business_id = p_business_id
    returning id into v_id;
  end if;
  return v_id;
end; $$;
grant execute on function public.upsert_booking_tag(
  uuid, uuid, text, int, text, text, int, text, boolean, int, text
) to authenticated;

-- ----- 4. Active tags reader v2 (now returns image_url) -----
create or replace function public.active_booking_tags(p_business_id uuid)
returns table (
  id uuid, name text, description text, emoji text,
  duration_minutes int, price_cents int, color text, image_url text
)
language sql stable security definer set search_path = public as $$
  select id, name, description, emoji, duration_minutes, price_cents, color, image_url
    from public.booking_tags
   where business_id = p_business_id and is_active
   order by sort_order, created_at;
$$;
grant execute on function public.active_booking_tags(uuid) to anon, authenticated;

-- ----- 5. Busy slots reader -----
-- Returns occupied ranges for a given day. Customer UI uses this to render
-- "Reserved" tiles next to open ones (so users see why a time is missing).
create or replace function public.list_busy_slots(
  p_business_id uuid,
  p_day         date
)
returns table (slot_start timestamptz, slot_end timestamptz)
language sql stable security definer set search_path = public as $$
  select scheduled_at, scheduled_end
    from public.bookings
   where business_id = p_business_id
     and status in ('pending','confirmed')
     and scheduled_at >= (p_day::text || ' 00:00')::timestamptz
     and scheduled_at <  ((p_day + 1)::text || ' 00:00')::timestamptz
   order by scheduled_at;
$$;
grant execute on function public.list_busy_slots(uuid, date) to anon, authenticated;

-- ----- 6. mirror_ghl_booking: server-side import of a GHL appointment -----
-- Called from /api/webhooks/ghl/[slug] when GHL pings us about an appointment
-- being created / updated / cancelled on their side. Uses security definer to
-- bypass RLS but only writes to the matching business_id.
create or replace function public.mirror_ghl_booking(
  p_business_id      uuid,
  p_ghl_event_id     text,
  p_tag_id           uuid,             -- nullable
  p_tag_name         text,
  p_duration_minutes int,
  p_scheduled_at     timestamptz,
  p_customer_name    text,
  p_customer_phone   text,
  p_customer_email   text,
  p_status           text,             -- pending|confirmed|cancelled|completed|no_show
  p_notes            text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_existing uuid;
  v_id       uuid;
begin
  if p_status not in ('pending','confirmed','completed','cancelled','no_show') then
    raise exception 'invalid status';
  end if;

  -- Find existing mirror by external id stored in notes prefix marker.
  -- (No dedicated column yet — stable marker in notes is fine for v1.)
  select id into v_existing
    from public.bookings
   where business_id = p_business_id
     and notes like ('GHL:' || p_ghl_event_id || '%');

  if v_existing is null then
    insert into public.bookings
      (business_id, tag_id, tag_name, duration_minutes, scheduled_at,
       customer_name, customer_phone, customer_email, notes, status)
    values
      (p_business_id, p_tag_id, p_tag_name, p_duration_minutes, p_scheduled_at,
       p_customer_name, p_customer_phone, p_customer_email,
       'GHL:' || p_ghl_event_id || coalesce(' · ' || p_notes, ''),
       p_status)
    returning id into v_id;
  else
    update public.bookings
       set tag_id           = p_tag_id,
           tag_name         = p_tag_name,
           duration_minutes = p_duration_minutes,
           scheduled_at     = p_scheduled_at,
           customer_name    = p_customer_name,
           customer_phone   = p_customer_phone,
           customer_email   = p_customer_email,
           notes            = 'GHL:' || p_ghl_event_id || coalesce(' · ' || p_notes, ''),
           status           = p_status,
           updated_at       = now()
     where id = v_existing
    returning id into v_id;
  end if;

  return v_id;
end; $$;
-- Service role only — called from the webhook handler with the service key.
revoke all on function public.mirror_ghl_booking(uuid, text, uuid, text, int, timestamptz, text, text, text, text, text) from public, anon, authenticated;

-- ----- 7. Storage bucket for booking tag images -----
insert into storage.buckets (id, name, public)
  values ('booking-tag-images', 'booking-tag-images', true)
on conflict (id) do update set public = excluded.public;

-- Extend the unified business-asset policies to include this bucket.
-- Easier path: drop + recreate the two policies with the bucket added.
do $$
begin
  begin drop policy "Atlas staff manages business assets" on storage.objects;
  exception when undefined_object then null; end;
  begin drop policy "Public read business assets" on storage.objects;
  exception when undefined_object then null; end;
end $$;

create policy "Atlas staff manages business assets"
  on storage.objects
  for all
  to authenticated
  using (
    bucket_id in (
      'business-logos','business-heroes','reward-images',
      'offer-images','news-images','membership-images','booking-tag-images'
    )
    and (
      exists (select 1 from public.business_users
              where user_id = auth.uid() and role = 'agency_admin')
      or exists (select 1 from public.business_users bu
                 where bu.user_id = auth.uid()
                   and bu.role in ('business_manager','business_staff')
                   and split_part(storage.objects.name, '/', 1) = bu.business_id::text)
    )
  )
  with check (
    bucket_id in (
      'business-logos','business-heroes','reward-images',
      'offer-images','news-images','membership-images','booking-tag-images'
    )
    and (
      exists (select 1 from public.business_users
              where user_id = auth.uid() and role = 'agency_admin')
      or exists (select 1 from public.business_users bu
                 where bu.user_id = auth.uid()
                   and bu.role in ('business_manager','business_staff')
                   and split_part(storage.objects.name, '/', 1) = bu.business_id::text)
    )
  );

create policy "Public read business assets"
  on storage.objects
  for select
  to public
  using (bucket_id in (
    'business-logos','business-heroes','reward-images',
    'offer-images','news-images','membership-images','booking-tag-images'
  ));
