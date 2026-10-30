-- CP-157 · live "in use right now" status per bookable resource (customer Book tab)
-- Safe to re-run. Counts pending+confirmed bookings covering now(); tells the
-- app how many units are busy and when the next one frees up.
drop function if exists public.booking_resources_now(uuid);
create or replace function public.booking_resources_now(p_business_id uuid)
returns table (resource_id uuid, units int, busy_now int, next_free_at timestamptz, booked_today int)
language sql stable security definer set search_path = public as $$
  with tz as (select public.business_timezone(p_business_id) as z),
  live as (
    select b.resource_id, b.scheduled_end
      from public.bookings b
     where b.business_id = p_business_id
       and b.resource_id is not null
       and b.status in ('pending','confirmed')
       and b.scheduled_at <= now() and b.scheduled_end > now()
  ),
  today as (
    select b.resource_id, count(*)::int as n
      from public.bookings b, tz
     where b.business_id = p_business_id
       and b.resource_id is not null
       and b.status in ('pending','confirmed')
       and (b.scheduled_at at time zone tz.z)::date = (now() at time zone tz.z)::date
     group by b.resource_id
  )
  select r.id, r.units,
         coalesce((select count(*)::int from live l where l.resource_id = r.id), 0),
         (select min(l.scheduled_end) from live l where l.resource_id = r.id),
         coalesce((select n from today t where t.resource_id = r.id), 0)
    from public.booking_resources r
   where r.business_id = p_business_id and r.is_active;
$$;
revoke all on function public.booking_resources_now(uuid) from public, anon;
grant execute on function public.booking_resources_now(uuid) to authenticated;
