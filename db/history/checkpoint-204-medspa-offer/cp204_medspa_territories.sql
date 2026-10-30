-- CP-204 · Area lock (one med spa per area) + founding spots + area on leads. Additive, safe to re-run.

-- Every practice holding an area. A row is created automatically when Andrew taps
-- "They paid" on a funnel booking (/api/landing/outcome). Add or edit rows by hand
-- for clients you closed outside the funnel. active=false reopens the area.
create table if not exists public.medspa_territories (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  business      text not null,
  zip           text not null,
  lat           double precision not null,
  lng           double precision not null,
  city          text,
  state         text,
  radius_miles  numeric not null default 10,
  founding      boolean not null default false,
  active        boolean not null default true,
  lead_id       uuid references public.landing_leads(id) on delete set null,
  notes         text
);
create index if not exists medspa_territories_active_idx on public.medspa_territories (active) where active;
alter table public.medspa_territories enable row level security;
-- No policies: only the server reads it.

alter table public.landing_leads
  add column if not exists zip       text,
  add column if not exists city      text,
  add column if not exists state     text,
  add column if not exists area_open boolean;
