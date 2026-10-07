-- CP-201 · /medspa ads funnel: qualify gate, pre-call page, reminders, outcomes.
-- Additive only (new table + new nullable columns). Safe to run more than once.

-- 1) Step-1 qualify submissions. Every visitor who fills the form lands here,
--    qualified or not, so Andrew sees the full funnel (and nurtures the rest).
create table if not exists public.landing_leads (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  niche             text not null default 'medspa',
  name              text not null,
  role              text not null,
  business          text not null,
  email             text not null,
  phone             text not null,
  website           text,
  booking_system    text,
  stage             text,
  practice_type     text,
  treatments        text[] not null default '{}',
  worth_it          text,
  visit_band        text,
  value_band        text,
  rebook            text,
  recall            text,
  estimate_likely   integer,
  app_color         text,
  qualified         boolean not null default false,
  disqualify_reasons text[] not null default '{}',
  status            text not null default 'new'
                    check (status in ('new','nurture','booked','showed','no_show','paid','lost')),
  demo_request_id   uuid,
  source            text,
  path              text,
  utm_source        text,
  utm_campaign      text,
  utm_content       text,
  fbp               text,
  fbc               text,
  lead_event_id     text,
  user_agent        text,
  ip_hash           text,
  notified_at       timestamptz,
  nurture_sent_at   timestamptz,
  followup_sent_at  timestamptz
);
create index if not exists landing_leads_created_idx on public.landing_leads (created_at desc);
create index if not exists landing_leads_unbooked_idx on public.landing_leads (created_at) where qualified and demo_request_id is null and followup_sent_at is null;
alter table public.landing_leads enable row level security;
-- No policies on purpose: only the server (service role) reads or writes leads.

-- 2) The booking gets the funnel's follow-through.
alter table public.landing_demo_requests
  add column if not exists lead_id            uuid references public.landing_leads(id) on delete set null,
  add column if not exists confirm_token      text,
  add column if not exists confirmed_at       timestamptz,
  add column if not exists video_pct          integer not null default 0,
  add column if not exists precall_viewed_at  timestamptz,
  add column if not exists reminder_early_at  timestamptz,
  add column if not exists reminder_late_at   timestamptz,
  add column if not exists outcome_prompt_at  timestamptz,
  add column if not exists outcome            text check (outcome in ('showed','no_show','paid','lost')),
  add column if not exists outcome_at         timestamptz,
  add column if not exists paid_value         numeric,
  add column if not exists schedule_event_id  text,
  add column if not exists fbp                text,
  add column if not exists fbc                text;
create unique index if not exists landing_demo_requests_confirm_token_key on public.landing_demo_requests (confirm_token) where confirm_token is not null;
create index if not exists landing_demo_requests_upcoming_idx on public.landing_demo_requests (slot_start) where slot_start is not null and outcome is null;
