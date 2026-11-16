-- CP-247 · new-booking emails to the owner + "no same-day booking"
-- NOT YET APPLIED. Run in the Supabase SQL editor (gqmjpntzupnmjooszvcd)
-- BEFORE deploying the code. Safe to re-run.
--
-- 1. business_booking_alerts: who gets emailed when a customer books from the
--    app or the venue website. Its own table on purpose: the businesses row
--    reaches customers' browsers, and the owner's inbox shouldn't.
-- 2. bookings.owner_notified_at / owner_notify_attempts: the queue the
--    /api/bookings/owner-alerts cron (every minute) works through.
-- 3. businesses.booking_hours.same_day = false → app and website bookings
--    can't start on the business's current local day. Enforced here, in a
--    trigger, so every path obeys it (app RPC, website API, anything later);
--    the front desk (source = 'desk') is exempt.
-- 4. Flippo's: mary@mbflippos.com, same-day off.

-- ── 1. recipients ──────────────────────────────────────────────────────
create table if not exists public.business_booking_alerts (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  emails      text[] not null default '{}',
  updated_at  timestamptz not null default now()
);
alter table public.business_booking_alerts enable row level security;
-- No policies: only the service role and the two functions below touch it.

create or replace function public.get_booking_alert_emails(p_business_id uuid)
returns text[] language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.manages_business(p_business_id) or public.is_agency_admin()) then
    raise exception 'not allowed';
  end if;
  return coalesce((select emails from public.business_booking_alerts where business_id = p_business_id), '{}');
end; $$;

create or replace function public.set_booking_alert_emails(p_business_id uuid, p_emails text[])
returns text[] language plpgsql security definer set search_path = public as $$
declare v_clean text[];
begin
  if not (public.manages_business(p_business_id) or public.is_agency_admin()) then
    raise exception 'not allowed';
  end if;
  select coalesce(array_agg(distinct e), '{}') into v_clean
    from (select lower(trim(x)) as e from unnest(coalesce(p_emails, '{}')) x) s
   where e ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$';
  if array_length(v_clean, 1) > 5 then raise exception 'up to 5 emails'; end if;
  insert into public.business_booking_alerts (business_id, emails, updated_at)
  values (p_business_id, v_clean, now())
  on conflict (business_id) do update set emails = excluded.emails, updated_at = now();
  return v_clean;
end; $$;

revoke all on function public.get_booking_alert_emails(uuid) from public, anon;
revoke all on function public.set_booking_alert_emails(uuid, text[]) from public, anon;
grant execute on function public.get_booking_alert_emails(uuid) to authenticated;
grant execute on function public.set_booking_alert_emails(uuid, text[]) to authenticated;

-- ── 2. the queue ───────────────────────────────────────────────────────
alter table public.bookings add column if not exists owner_notified_at     timestamptz;
alter table public.bookings add column if not exists owner_notify_attempts int not null default 0;
-- Everything already booked counts as handled, so turning this on doesn't
-- email the backlog. (Only touches rows not yet marked.)
update public.bookings set owner_notified_at = now() where owner_notified_at is null and created_at < now();
create index if not exists bookings_owner_alert_queue
  on public.bookings (created_at) where owner_notified_at is null;

-- The cron claims rows first (so two overlapping runs can't double-send),
-- then marks them sent or hands them back. Desk bookings never email: the
-- person who made them is standing at the desk.
create or replace function public.claim_booking_owner_alerts(p_limit int default 25)
returns table (
  booking_id uuid, business_id uuid, business_name text, business_slug text, timezone text,
  emails text[], resource_name text, scheduled_at timestamptz, duration_minutes int,
  party_size int, customer_name text, customer_phone text, customer_email text,
  notes text, source text, status text
)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with picked as (
    select b.id
      from public.bookings b
      join public.business_booking_alerts a on a.business_id = b.business_id and cardinality(a.emails) > 0
     where b.owner_notified_at is null
       and b.source <> 'desk'
       and b.owner_notify_attempts < 5
       and b.created_at > now() - interval '2 days'
     order by b.created_at
     limit greatest(1, least(p_limit, 100))
       for update of b skip locked
  ), claimed as (
    update public.bookings b set owner_notified_at = now()
      from picked where b.id = picked.id
    returning b.*
  )
  select c.id, c.business_id, z.name::text, z.slug::text, public.business_timezone(c.business_id),
         a.emails, coalesce(c.tag_name, 'Booking')::text, c.scheduled_at, c.duration_minutes,
         c.party_size, c.customer_name::text, c.customer_phone::text, c.customer_email::text,
         c.notes::text, c.source::text, c.status::text
    from claimed c
    join public.businesses z on z.id = c.business_id
    join public.business_booking_alerts a on a.business_id = c.business_id;
end; $$;

create or replace function public.release_booking_owner_alert(p_booking_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.bookings
     set owner_notified_at = null, owner_notify_attempts = owner_notify_attempts + 1
   where id = p_booking_id;
$$;

revoke all on function public.claim_booking_owner_alerts(int) from public, anon, authenticated;
revoke all on function public.release_booking_owner_alert(uuid) from public, anon, authenticated;
grant execute on function public.claim_booking_owner_alerts(int) to service_role;
grant execute on function public.release_booking_owner_alert(uuid) to service_role;

-- ── 3. no same-day booking ─────────────────────────────────────────────
create or replace function public.bookings_enforce_same_day()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_tz text;
begin
  if new.source = 'desk' or new.scheduled_at is null then return new; end if;
  if exists (
    select 1 from public.businesses
     where id = new.business_id and (booking_hours ->> 'same_day') = 'false'
  ) then
    v_tz := public.business_timezone(new.business_id);
    if (new.scheduled_at at time zone v_tz)::date <= (now() at time zone v_tz)::date then
      raise exception 'same-day booking is off — please pick tomorrow or later';
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists bookings_enforce_same_day on public.bookings;
create trigger bookings_enforce_same_day
  before insert on public.bookings
  for each row execute function public.bookings_enforce_same_day();

-- ── 4. Flippo's ────────────────────────────────────────────────────────
insert into public.business_booking_alerts (business_id, emails)
select id, array['mary@mbflippos.com'] from public.businesses where slug = 'flippo-s-arcade-and-batting-cage'
on conflict (business_id) do update set emails = excluded.emails, updated_at = now();

update public.businesses
   set booking_hours = coalesce(booking_hours, '{}'::jsonb) || '{"same_day": false}'::jsonb
 where slug = 'flippo-s-arcade-and-batting-cage';

-- Check:
-- select b.slug, b.booking_hours->>'same_day' as same_day, a.emails
--   from public.businesses b left join public.business_booking_alerts a on a.business_id = b.id
--  where b.slug = 'flippo-s-arcade-and-batting-cage';
