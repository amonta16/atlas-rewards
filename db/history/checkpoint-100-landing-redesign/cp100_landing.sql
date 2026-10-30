-- ============================================================================
-- CP-100 — Landing page redesign: demo requests + agency waitlist
-- Run in Supabase SQL editor (idempotent — safe to re-run).
-- ============================================================================

-- Demo requests from the "Book a free demo" form (modal + /book-demo page).
create table if not exists public.landing_demo_requests (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  name            text not null,
  business        text not null,
  email           text not null,
  phone           text not null,
  industry        text,
  preferred_time  text,
  notes           text,
  source          text,          -- which CTA opened the form (hero / vsl / pricing / final …)
  path            text,          -- page path the form was submitted from
  user_agent      text,
  ip_hash         text,          -- sha256 of IP, for abuse review only
  status          text not null default 'new' check (status in ('new','contacted','booked','closed')),
  notified_at     timestamptz    -- when the email to CONTACT_EMAIL was sent
);
create index if not exists landing_demo_requests_created_idx on public.landing_demo_requests (created_at desc);

-- Agency white-label tool waitlist (capped at 50 in app config).
create table if not exists public.landing_waitlist (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  email       text not null,
  agency      text,
  clients     text,
  ip_hash     text,
  notified_at timestamptz
);
-- One row per email (case-insensitive) so re-submits don't inflate the count.
create unique index if not exists landing_waitlist_email_uidx on public.landing_waitlist (lower(email));

-- Lock both tables down: only the service role (API routes) reads/writes.
alter table public.landing_demo_requests enable row level security;
alter table public.landing_waitlist       enable row level security;
-- Agency admins can read leads from the dashboard later (no policy for anon).
drop policy if exists "agency admins read demo requests" on public.landing_demo_requests;
create policy "agency admins read demo requests" on public.landing_demo_requests
  for select to authenticated
  using (exists (select 1 from public.business_users bu where bu.user_id = auth.uid() and bu.role = 'agency_admin'));
drop policy if exists "agency admins read waitlist" on public.landing_waitlist;
create policy "agency admins read waitlist" on public.landing_waitlist
  for select to authenticated
  using (exists (select 1 from public.business_users bu where bu.user_id = auth.uid() and bu.role = 'agency_admin'));

-- Public, read-only count for the live "34 / 50" display (no rows exposed).
create or replace function public.landing_waitlist_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.landing_waitlist;
$$;
grant execute on function public.landing_waitlist_count() to anon, authenticated, service_role;
