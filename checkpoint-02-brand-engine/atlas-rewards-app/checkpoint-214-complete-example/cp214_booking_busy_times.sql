-- CP-214 · APPLIED to production Oct 22 2026 via the Supabase MCP (migration cp214_booking_busy_times).
-- Taken times for a business's day, for the med spa booking picker. Start/end only (no names or notes).
create or replace function public.booking_busy_times(p_business_id uuid, p_day date)
returns table(starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path to 'public' as $$
  select b.scheduled_at, b.scheduled_end
    from public.bookings b
   where b.business_id = p_business_id
     and b.status in ('pending', 'confirmed')
     and b.scheduled_at < (p_day + 2)::timestamptz
     and b.scheduled_end > (p_day - 1)::timestamptz;
$$;
grant execute on function public.booking_busy_times(uuid, date) to anon, authenticated;
