-- CP-155 · booking categories (Batting cages / Parties / Pool …)
-- Groups bookable resources into sections on the customer Book tab, the
-- builder list and the front-desk day sheet. Safe to re-run.
alter table public.booking_resources add column if not exists category text;

-- list_booking_resources gains `category` (return type changes → drop first).
drop function if exists public.list_booking_resources(uuid);
create or replace function public.list_booking_resources(p_business_id uuid)
returns table (
  id uuid, name text, description text, emoji text, image_url text,
  units int, unit_label text, durations int[], slot_minutes int, buffer_minutes int,
  max_party int, price_cents int, deposit_cents int, hours jsonb,
  lead_minutes int, horizon_days int, is_active boolean, sort_order int,
  category text
)
language sql stable security definer set search_path = public as $$
  select r.id, r.name, r.description, r.emoji, r.image_url,
         r.units, r.unit_label, r.durations, r.slot_minutes, r.buffer_minutes,
         r.max_party, r.price_cents, r.deposit_cents, r.hours,
         r.lead_minutes, r.horizon_days, r.is_active, r.sort_order,
         r.category
    from public.booking_resources r
   where r.business_id = p_business_id
     and (r.is_active or public.staffs_business(p_business_id))
   order by r.sort_order, r.created_at;
$$;
revoke all on function public.list_booking_resources(uuid) from public, anon;
grant execute on function public.list_booking_resources(uuid) to authenticated;
