-- CP-101 — booking calendar: requested slot on demo requests (run after cp100_landing.sql)
alter table public.landing_demo_requests
  add column if not exists slot_start timestamptz,
  add column if not exists timezone   text;
create index if not exists landing_demo_requests_slot_idx on public.landing_demo_requests (slot_start);
