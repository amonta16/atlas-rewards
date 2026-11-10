-- CP-238 · Lead funnel analytics + the lead-magnet follow-up emails.
--
--   funnel_visits      one row per landing-page visit (anonymous visitor id, utm), so the
--                      admin Lead funnel page can show visits → opt-ins → bookings → paid.
--   lead_email_steps   the follow-up email sequence for owners who opt in on /medspa/app
--                      (timing + copy), edited in Admin → Lead funnel → Follow-up emails.
--   app_previews       + nurture_step / nurture_last_at / nurture_stopped_at /
--                      nurture_unsubscribed_at, so the cron knows which email each owner
--                      has had, never double-sends, and stops once they book or pay.
--
-- Additive and safe to re-run. All three are service-role only (RLS on, no policies):
-- the site writes through /api/landing/visit and the cron; admins read through the
-- server-rendered page.
--
-- Undo:
--   drop table if exists public.funnel_visits;
--   drop table if exists public.lead_email_steps;
--   alter table public.app_previews drop column if exists nurture_step,
--     drop column if exists nurture_last_at, drop column if exists nurture_stopped_at,
--     drop column if exists nurture_unsubscribed_at;

create table if not exists public.funnel_visits (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  path          text not null check (char_length(path) <= 120),
  visitor_id    text not null check (visitor_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  utm_source    text check (utm_source is null or char_length(utm_source) <= 80),
  utm_campaign  text check (utm_campaign is null or char_length(utm_campaign) <= 120),
  utm_content   text check (utm_content is null or char_length(utm_content) <= 120),
  referrer_host text check (referrer_host is null or char_length(referrer_host) <= 120),
  ip_hash       text
);
create index if not exists funnel_visits_path_created_idx on public.funnel_visits (path, created_at desc);
alter table public.funnel_visits enable row level security;

create table if not exists public.lead_email_steps (
  step         smallint primary key check (step between 1 and 10),
  name         text not null check (char_length(name) <= 60),
  delay_hours  integer not null check (delay_hours between 1 and 2160),
  subject      text not null check (char_length(subject) <= 160),
  preheader    text check (preheader is null or char_length(preheader) <= 160),
  body         text not null check (char_length(body) <= 6000),
  enabled      boolean not null default true,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users(id) on delete set null
);
alter table public.lead_email_steps enable row level security;

alter table public.app_previews
  add column if not exists nurture_step            smallint not null default 0,
  add column if not exists nurture_last_at         timestamptz,
  -- set when the owner booked a walkthrough, paid, or the preview expired
  add column if not exists nurture_stopped_at      timestamptz,
  add column if not exists nurture_unsubscribed_at timestamptz;

create index if not exists app_previews_nurture_idx on public.app_previews (contact_at)
  where contact_at is not null and nurture_unsubscribed_at is null and nurture_stopped_at is null and claimed_at is null;

-- The three starting emails (tone after the Sabri Suby "KONG" sequence: the product talks).
-- Keep in sync with DEFAULT_STEPS in apps/venues/lib/landing/lead-nurture.ts. Only inserts
-- missing steps, so re-running never overwrites copy edited in the admin.
insert into public.lead_email_steps (step, name, delay_hours, subject, preheader, body) values
(1, 'Saw you clicking around', 24,
 '{first_name}, saw you clicking around',
 'Like what you see? This is just the start.',
 E'Hey {first_name},\n\nIt''s {spa_name}''s app. Yes, the one we built you.\n\nSaw you''ve been clicking around my front desk.\n\nLike what you see?\n\nI bet you do...\n\nBut right now I''m only a preview. I can''t save anything, and your patients can''t join me yet.\n\nSwitch me on and I start doing the work:\n- Reminding patients before their treatment wears off\n- Selling memberships that bill every month\n- Sending birthday and win-back gifts on my own\n\nIt takes one 15-minute call. Andrew switches me on with you, live:\n{walkthrough_link}\n\nTalk soon,\n{spa_name}''s app\n(sent by Andrew at Atlas Engine. Just reply if you have a question.)'),
(2, 'Why not switch me on?', 72,
 '{spa_name}''s app here. Did you forget about me?',
 'You built me, then left me in preview.',
 E'Oh, hi {first_name}!\n\nJust checking in. I noticed you built me, {spa_name}''s own patient app, but I''m still sitting in preview.\n\nThat''s weird.\n\nWhy wouldn''t you want me?\n\nI''d be reminding every patient who''s due for a touch-up...\nTurning one-time visits into monthly members...\nAnd getting you more Google reviews while you''re busy with patients.\n\nMaybe you''re waiting for the perfect moment. Smart.\n\nBut a gentle reminder: the patients who are due right now only come back if someone reminds them. That''s my whole job.\n\nHere''s your app again, if you want another look:\n{app_link}\n\nAnd when you''re ready, book 15 minutes and we switch me on together:\n{walkthrough_link}\n\nYours,\n{spa_name}''s app'),
(3, 'Last chance', 288,
 'Last chance: I''m deleted on {expires_on}',
 'You saw what I can do. Don''t let me go.',
 E'{first_name},\n\nYou saw what I can do.\n\nYour logo. Your treatments. Your patients'' app, on their phones.\n\nAnd I know you liked it.\n\nBut you haven''t switched me on yet, and on {expires_on} your preview gets deleted.\n\nYou won''t let me go without a fight, will you?\n\nDidn''t think so.\n\nBook 15 minutes here and I''m live for {spa_name}:\n{walkthrough_link}\n\nIf now isn''t the time, no problem. Reply "later" and Andrew will check in next quarter.\n\nSincerely yours,\n{spa_name}''s app')
on conflict (step) do nothing;
