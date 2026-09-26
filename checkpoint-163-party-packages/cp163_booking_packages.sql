-- CP-163 · party packages on a bookable resource. Safe to re-run.
-- packages = [{ "id", "name", "price_cents", "blurb", "includes": [..], "duration": 120|null, "image_url": null }]
alter table public.booking_resources add column if not exists packages jsonb not null default '[]'::jsonb;

drop function if exists public.list_booking_resources(uuid);
create or replace function public.list_booking_resources(p_business_id uuid)
returns table (
  id uuid, name text, description text, emoji text, image_url text,
  units int, unit_label text, durations int[], slot_minutes int, buffer_minutes int,
  max_party int, price_cents int, deposit_cents int, hours jsonb,
  lead_minutes int, horizon_days int, is_active boolean, sort_order int,
  category text, packages jsonb
)
language sql stable security definer set search_path = public as $$
  select r.id, r.name, r.description, r.emoji, r.image_url,
         r.units, r.unit_label, r.durations, r.slot_minutes, r.buffer_minutes,
         r.max_party, r.price_cents, r.deposit_cents, r.hours,
         r.lead_minutes, r.horizon_days, r.is_active, r.sort_order,
         r.category, coalesce(r.packages, '[]'::jsonb)
    from public.booking_resources r
   where r.business_id = p_business_id
     and (r.is_active or public.staffs_business(p_business_id))
   order by r.sort_order, r.created_at;
$$;
revoke all on function public.list_booking_resources(uuid) from public, anon;
grant execute on function public.list_booking_resources(uuid) to authenticated;
