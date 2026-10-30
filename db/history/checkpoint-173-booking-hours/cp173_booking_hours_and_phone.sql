-- CP-173 · per-day business booking hours + Flippo's real hours & phone
--
-- booking_hours gains an optional "week" map keyed by ISO weekday
-- ("1"=Mon … "7"=Sun) → ["open","close"]; a missing day is closed. When
-- present it wins over the legacy start/end/days (which the editor keeps
-- populated with the widest window for anything old that still reads them).
-- Idempotent. Safe to re-run.

create or replace function public.booking_resource_windows(p_resource_id uuid, p_isodow integer)
returns table(open_t time, close_t time)
language plpgsql stable security definer set search_path = public as $$
declare v_hours jsonb; v_bhours jsonb; v_days jsonb; v_w jsonb;
begin
  select r.hours, b.booking_hours into v_hours, v_bhours
    from public.booking_resources r join public.businesses b on b.id = r.business_id
   where r.id = p_resource_id;
  -- resource's own schedule wins
  if v_hours is not null and v_hours ? p_isodow::text then
    return query select (w->>0)::time, (w->>1)::time from jsonb_array_elements(v_hours -> p_isodow::text) w;
    return;
  end if;
  if v_hours is not null then return; end if;   -- own schedule, closed today
  -- CP-173: per-day business hours
  if v_bhours ? 'week' then
    v_w := v_bhours -> 'week' -> p_isodow::text;
    if v_w is null then return; end if;
    return query select (v_w->>0)::time, (v_w->>1)::time;
    return;
  end if;
  -- legacy single window
  v_days := coalesce(v_bhours -> 'days', '[1,2,3,4,5,6,7]'::jsonb);
  if exists (select 1 from jsonb_array_elements_text(v_days) d where d::int = p_isodow) then
    return query select coalesce((v_bhours->>'start')::time, '09:00'::time), coalesce((v_bhours->>'end')::time, '21:00'::time);
  end if;
end $$;

create or replace function public.available_booking_slots(p_business_id uuid, p_tag_id uuid, p_day date)
returns table(slot_start timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  v_hours jsonb; v_start_t time; v_end_t time; v_step int; v_dur int; v_dow int; v_dow_ok boolean;
  v_cursor timestamptz; v_end_ts timestamptz; v_slot_end timestamptz; v_w jsonb;
begin
  select booking_hours into v_hours from public.businesses where id = p_business_id;
  v_dow  := extract(isodow from p_day)::int;
  v_step := coalesce((v_hours->>'slot_minutes')::int, 15);
  if v_hours ? 'week' then
    v_w := v_hours -> 'week' -> v_dow::text;
    if v_w is null then return; end if;
    v_start_t := (v_w->>0)::time; v_end_t := (v_w->>1)::time;
  else
    v_start_t := (v_hours->>'start')::time;
    v_end_t   := (v_hours->>'end')::time;
    v_dow_ok  := exists (select 1 from jsonb_array_elements_text(v_hours->'days') d where d::int = v_dow);
    if not v_dow_ok then return; end if;
  end if;

  select duration_minutes into v_dur from public.booking_tags where id = p_tag_id and business_id = p_business_id;
  if v_dur is null then raise exception 'tag not found for this business'; end if;

  v_cursor := (p_day::text || ' ' || v_start_t::text)::timestamptz;
  v_end_ts := (p_day::text || ' ' || v_end_t::text)::timestamptz;
  while v_cursor + (v_dur || ' minutes')::interval <= v_end_ts loop
    v_slot_end := v_cursor + (v_dur || ' minutes')::interval;
    if v_cursor > now() then
      if not exists (select 1 from public.bookings b where b.business_id = p_business_id
                      and b.status in ('pending','confirmed') and b.scheduled_at < v_slot_end and b.scheduled_end > v_cursor) then
        slot_start := v_cursor; return next;
      end if;
    end if;
    v_cursor := v_cursor + (v_step || ' minutes')::interval;
  end loop;
end $$;

-- Flippo's: Mon–Thu 10–8 · Fri–Sat 11–9 · Sun 11–7 (mbflippos.com/contact-us) · (805) 225-1099
update public.businesses
   set booking_hours = jsonb_build_object(
         'slot_minutes', coalesce((booking_hours->>'slot_minutes')::int, 15),
         'start', '10:00', 'end', '21:00', 'days', '[1,2,3,4,5,6,7]'::jsonb,
         'week', '{"1":["10:00","20:00"],"2":["10:00","20:00"],"3":["10:00","20:00"],"4":["10:00","20:00"],"5":["11:00","21:00"],"6":["11:00","21:00"],"7":["11:00","19:00"]}'::jsonb),
       contact_info = coalesce(contact_info, '{}'::jsonb) || jsonb_build_object('phone', '8052251099', 'timezone', 'America/Los_Angeles')
 where id = 'ffcd5f3e-5518-437d-bda8-bb2887dc4348';

select booking_hours, contact_info from public.businesses where id = 'ffcd5f3e-5518-437d-bda8-bb2887dc4348';
