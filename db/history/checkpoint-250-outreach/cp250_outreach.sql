-- CP-250 · Outreach v1: Atlas's own small-volume cold email to med spas (Admin → Outreach).
-- Applied to production 2026-11-18 as migration cp250_outreach (comments trimmed; same statements). Safe to re-run.
--
--   outreach_campaigns     a named batch of leads (usually one city or area), can be paused
--   outreach_leads         one med spa: where it came from, its site, the email we found, status
--   outreach_messages      one row per lead per step: draft → approved → sent (or skipped / failed / cancelled)
--   outreach_replies       what came back into the outreach mailbox: replies, bounces, auto-replies
--   outreach_steps         the 3-step sequence (day 0 / 3 / 7), editable in the admin
--   outreach_settings      one row: daily cap, send window, approval mode, pause, mailbox read position
--   outreach_suppressions  emails and @domains we never contact (unsubscribes, bounces, "no thanks", by hand)
--
-- Service role only, like CP-238/243: RLS on, no policies. The admin reads and writes through
-- server routes that check agency_admin first.
--
-- Undo:
--   drop table if exists public.outreach_replies, public.outreach_messages, public.outreach_leads,
--     public.outreach_campaigns, public.outreach_steps, public.outreach_settings, public.outreach_suppressions cascade;

create table if not exists public.outreach_campaigns (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 80),
  area        text check (area is null or char_length(area) <= 120),
  paused      boolean not null default false,
  created_at  timestamptz not null default now()
);
alter table public.outreach_campaigns enable row level security;

create table if not exists public.outreach_leads (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid references public.outreach_campaigns(id) on delete set null,
  source          text not null check (source in ('places', 'csv', 'manual')),
  place_id        text unique,
  business_name   text not null check (char_length(business_name) between 1 and 160),
  address         text check (address is null or char_length(address) <= 240),
  city            text check (city is null or char_length(city) <= 80),
  state           text check (state is null or char_length(state) <= 40),
  phone           text check (phone is null or char_length(phone) <= 40),
  website         text check (website is null or char_length(website) <= 400),
  domain          text unique check (domain is null or char_length(domain) <= 200),
  rating          numeric(2,1),
  reviews         integer,
  email           text check (email is null or char_length(email) <= 200),
  email_source    text check (email_source is null or email_source in ('site', 'csv', 'manual')),
  email_mx_ok     boolean,
  emails_found    text[] not null default '{}',
  first_name      text check (first_name is null or char_length(first_name) <= 60),
  site_notes      text check (site_notes is null or char_length(site_notes) <= 2000),
  timezone        text not null default 'America/Los_Angeles',
  status          text not null default 'new' check (status in (
                    'new',            -- added, not read yet
                    'no_email',       -- read the site, found no usable email (add one by hand)
                    'review',         -- email 1 drafted, waiting for approval
                    'queued',         -- approved, waiting for a send slot
                    'contacted',      -- at least one email sent, sequence running
                    'done',           -- whole sequence sent, no reply
                    'replied', 'booked', 'not_interested', 'bounced', 'unsubscribed',
                    'stopped')),      -- skipped or stopped by hand
  step            smallint not null default 0,   -- last step sent (0 = none)
  next_at         timestamptz,                   -- when the next step is due
  stopped_reason  text check (stopped_reason is null or char_length(stopped_reason) <= 200),
  last_reply_at   timestamptz,
  reply_class     text,
  notes           text check (notes is null or char_length(notes) <= 2000),
  error           text check (error is null or char_length(error) <= 300),
  enriched_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists outreach_leads_email_uq on public.outreach_leads (lower(email)) where email is not null;
create index if not exists outreach_leads_status_idx on public.outreach_leads (status, next_at);
create index if not exists outreach_leads_campaign_idx on public.outreach_leads (campaign_id);
alter table public.outreach_leads enable row level security;

create table if not exists public.outreach_messages (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid not null references public.outreach_leads(id) on delete cascade,
  step         smallint not null check (step between 1 and 10),
  subject      text not null check (char_length(subject) <= 160),
  body         text not null check (char_length(body) <= 4000),
  ai           boolean not null default false,
  ai_detail    text check (ai_detail is null or char_length(ai_detail) <= 300),  -- the fact from their site the AI used
  status       text not null default 'draft' check (status in ('draft', 'approved', 'sending', 'sent', 'skipped', 'failed', 'cancelled')),
  message_id   text unique,                                   -- our RFC 5322 Message-ID, to match replies
  error        text check (error is null or char_length(error) <= 300),
  approved_at  timestamptz,
  approved_by  uuid references auth.users(id) on delete set null,
  sent_at      timestamptz,
  created_at   timestamptz not null default now(),
  unique (lead_id, step)
);
create index if not exists outreach_messages_status_idx on public.outreach_messages (status);
create index if not exists outreach_messages_sent_idx on public.outreach_messages (sent_at) where sent_at is not null;
alter table public.outreach_messages enable row level security;

create table if not exists public.outreach_replies (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid references public.outreach_leads(id) on delete set null,
  mail_uid     text unique not null,                          -- "<uidvalidity>:<uid>" in the mailbox
  kind         text not null check (kind in ('reply', 'bounce', 'auto')),
  class        text check (class is null or class in ('interested', 'not_now', 'not_interested', 'unsubscribe', 'out_of_office', 'bounce', 'other')),
  from_email   text check (from_email is null or char_length(from_email) <= 200),
  subject      text check (subject is null or char_length(subject) <= 300),
  body         text check (body is null or char_length(body) <= 6000),
  received_at  timestamptz not null default now(),
  handled      boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists outreach_replies_lead_idx on public.outreach_replies (lead_id);
create index if not exists outreach_replies_open_idx on public.outreach_replies (received_at desc) where not handled;
alter table public.outreach_replies enable row level security;

create table if not exists public.outreach_steps (
  step        smallint primary key check (step between 1 and 10),
  name        text not null check (char_length(name) <= 60),
  delay_days  smallint not null check (delay_days between 0 and 60),  -- after the previous step (step 1: 0)
  subject     text not null check (char_length(subject) <= 160),      -- step 2+: blank-ish subjects are sent as "Re: <email 1>"
  body        text not null check (char_length(body) <= 4000),
  ai          boolean not null default false,                         -- step 1: Claude writes it per lead
  enabled     boolean not null default true,
  updated_at  timestamptz not null default now()
);
alter table public.outreach_steps enable row level security;

insert into public.outreach_steps (step, name, delay_days, subject, body, ai) values
  (1, 'First email (AI-written per spa)', 0, 'quick question, {spa_name}',
   E'Hi {first_name},\n\nI build branded patient apps for med spas: your brand on their phone, each client''s treatment schedule and when they''re due next, memberships and aftercare in one place.\n\nWould it be useful if I sent over what one would look like for {spa_name}?',
   true),
  (2, 'Follow-up: see your app', 3, '',
   E'Hi {first_name},\n\nFollowing up in case this got buried. You can see a preview of your own app, built from your website, in about a minute here:\n{preview_link}\n\nIf it''s useful, there''s a 15-minute walkthrough too: {book_link}',
   false),
  (3, 'Last note', 4, '',
   E'Hi {first_name},\n\nI''ll leave it here so I don''t crowd your inbox. If bringing clients back on schedule is on your list this year, reply anytime and I''ll show you how {spa_name}''s app would work.\n\nThanks either way,',
   false)
on conflict (step) do nothing;

create table if not exists public.outreach_settings (
  id                 smallint primary key default 1 check (id = 1),
  daily_cap          smallint not null default 5 check (daily_cap between 0 and 50),
  send_days          smallint[] not null default '{1,2,3,4,5}',    -- 0 = Sunday … 6 = Saturday, in the lead's time zone
  window_start       smallint not null default 8 check (window_start between 0 and 23),
  window_end         smallint not null default 16 check (window_end between 1 and 24),
  gap_min_minutes    smallint not null default 4 check (gap_min_minutes between 1 and 120),
  gap_max_minutes    smallint not null default 12 check (gap_max_minutes between 1 and 240),
  approve_followups  boolean not null default false,               -- true: steps 2+ also wait in Review
  paused             boolean not null default false,
  paused_reason      text,
  from_name          text not null default 'Andrew Montano',
  signature          text not null default E'Andrew Montano\nAtlas Engine · atlas-engine.app',
  next_send_after    timestamptz,
  imap_uidvalidity   bigint,
  imap_last_uid      bigint not null default 0,
  last_tick_at       timestamptz,
  last_tick_note     text,
  updated_at         timestamptz not null default now(),
  check (window_end > window_start),
  check (gap_max_minutes >= gap_min_minutes)
);
insert into public.outreach_settings (id) values (1) on conflict (id) do nothing;
alter table public.outreach_settings enable row level security;

create table if not exists public.outreach_suppressions (
  value       text primary key check (value = lower(value) and char_length(value) between 3 and 200),  -- "x@y.com" or "@y.com"
  reason      text not null check (reason in ('unsubscribed', 'bounced', 'not_interested', 'manual', 'client')),
  created_at  timestamptz not null default now()
);
alter table public.outreach_suppressions enable row level security;
