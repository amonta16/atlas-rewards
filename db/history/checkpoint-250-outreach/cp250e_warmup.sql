-- CP-250e · Automated mailbox warm-up + a "ready for real spas" check. Additive and safe to re-run.
-- Applied to production 2026-11-24 as migration cp250e_warmup (comments trimmed; same statements).
--
-- A brand-new domain/mailbox that suddenly emails strangers lands in spam. Warm-up builds reputation
-- first: the engine sends a few honest, personal emails a day from the outreach mailbox to people who
-- know Andrew (his own Gmail, family, friends), asking them to reply (and to move it out of Spam or
-- Promotions if it landed there). Their replies are picked up by the inbox reader. The volume ramps up
-- over two weeks. The Warm-up card on Overview tracks progress and says when the mailbox is ready for
-- real spas; Andrew then presses Go live.
--
--   outreach_warmup_contacts   who gets warm-up emails (added in the admin, never committed to the repo)
--   outreach_warmup_log        each warm-up email: to whom, when, did they reply, did it bounce
--   outreach_settings          warmup_enabled, warmup_started_at, next_warmup_after, warmup_ready_notified_at
--
-- Real spa emails are held by the existing Pause switch until Go live. Warm-up emails are personal
-- notes to people who know Andrew, not commercial email, so they carry no opt-out footer.
--
-- Undo:
--   drop table if exists public.outreach_warmup_log, public.outreach_warmup_contacts;
--   alter table public.outreach_settings drop column if exists warmup_enabled, drop column if exists warmup_started_at,
--     drop column if exists next_warmup_after, drop column if exists warmup_ready_notified_at;

create table if not exists public.outreach_warmup_contacts (
  email       text primary key check (email = lower(email) and char_length(email) between 6 and 200),
  name        text check (name is null or char_length(name) <= 60),
  is_me       boolean not null default false,          -- Andrew's own address: gets the "ready" notice
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table public.outreach_warmup_contacts enable row level security;

create table if not exists public.outreach_warmup_log (
  id           uuid primary key default gen_random_uuid(),
  email        text not null check (char_length(email) <= 200),
  kind         text not null default 'note' check (kind in ('note', 'thanks', 'ready')),
  subject      text not null check (char_length(subject) <= 200),
  message_id   text unique,
  status       text not null default 'sent' check (status in ('sent', 'failed', 'bounced')),
  error        text check (error is null or char_length(error) <= 300),
  sent_at      timestamptz not null default now(),
  replied_at   timestamptz
);
create index if not exists outreach_warmup_log_sent_idx on public.outreach_warmup_log (sent_at desc);
create index if not exists outreach_warmup_log_email_idx on public.outreach_warmup_log (email, sent_at desc);
alter table public.outreach_warmup_log enable row level security;

alter table public.outreach_settings add column if not exists warmup_enabled boolean not null default true;
alter table public.outreach_settings add column if not exists warmup_started_at timestamptz;
alter table public.outreach_settings add column if not exists next_warmup_after timestamptz;
alter table public.outreach_settings add column if not exists warmup_ready_notified_at timestamptz;
