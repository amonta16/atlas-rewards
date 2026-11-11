-- CP-243 (lead-magnet audit, step 6): the follow-up SEQUENCE — texts, emails and call tasks on one
-- clock, edited in Admin → Lead funnel → Sequence, with every lead's follow-through visible.
-- Applied to production 2026-11-10 as migration cp243_lead_sequence (the cron switches over once the step 6 code is deployed).
--
--   lead_sequence_steps   the schedule: one row per step (channel, minutes after opt-in, copy or
--                         call script, on/off). Seeded with the audit's schedule:
--                         0:45 SMS · 3 h email · 5 h call · 24 h SMS · day 2 email · day 3 call ·
--                         day 4 SMS · day 6 email · day 8 break-up email · day 14 nurture email
--   lead_sequence_log     what happened to each lead at each step: sent / would_send (sending off) /
--                         skipped (+ why) / failed / task_open → task_done (+ outcome) / cancelled
--   app_previews          + seq_step (next step index), sms_stopped_at (they replied to a text),
--                         seq_stopped_reason (booked / paid / unsubscribed / admin)
--
-- Rules the cron follows (lib/landing/lead-sequence-run.ts):
--   · SMS only to owners with SMS consent on file, and never after they reply to one (any reply).
--   · Booking a walkthrough (or paying) cancels every remaining step, open call tasks included.
--   · Emails stop on unsubscribe; texts on STOP (Twilio) or any reply.
--
-- Service-role only (RLS on, no policies), like CP-238. Safe to re-run.
--
-- Undo:
--   drop table if exists public.lead_sequence_log;
--   drop table if exists public.lead_sequence_steps;
--   alter table public.app_previews drop column if exists seq_step, drop column if exists sms_stopped_at,
--     drop column if exists seq_stopped_reason;

create table if not exists public.lead_sequence_steps (
  step           smallint primary key check (step between 1 and 30),
  channel        text not null check (channel in ('email', 'sms', 'call')),
  name           text not null check (char_length(name) <= 60),
  delay_minutes  integer not null check (delay_minutes between 1 and 43200),
  subject        text check (subject is null or char_length(subject) <= 160),
  preheader      text check (preheader is null or char_length(preheader) <= 160),
  body           text not null check (char_length(body) <= 6000),
  enabled        boolean not null default true,
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users(id) on delete set null,
  check (channel <> 'email' or subject is not null)
);
alter table public.lead_sequence_steps enable row level security;

create table if not exists public.lead_sequence_log (
  id          uuid primary key default gen_random_uuid(),
  preview_id  uuid not null references public.app_previews(id) on delete cascade,
  step        smallint not null,
  channel     text not null check (channel in ('email', 'sms', 'call')),
  status      text not null check (status in ('sent', 'would_send', 'skipped', 'failed', 'task_open', 'task_done', 'cancelled')),
  reason      text check (reason is null or char_length(reason) <= 200),
  outcome     text check (outcome is null or outcome in ('talked', 'no_answer', 'voicemail', 'booked', 'not_a_fit')),
  note        text check (note is null or char_length(note) <= 1000),
  due_at      timestamptz not null,
  at          timestamptz not null default now(),
  done_at     timestamptz,
  done_by     uuid references auth.users(id) on delete set null,
  unique (preview_id, step)
);
create index if not exists lead_sequence_log_open_idx on public.lead_sequence_log (due_at) where status = 'task_open';
alter table public.lead_sequence_log enable row level security;

alter table public.app_previews
  add column if not exists seq_step           smallint not null default 0,
  add column if not exists sms_stopped_at     timestamptz,
  add column if not exists seq_stopped_reason text check (seq_stopped_reason is null or char_length(seq_stopped_reason) <= 60);

-- Owners already part-way through the CP-238 emails keep their place: the old email n maps onto the
-- new schedule (email 1 → step 2, email 2 → step 5, email 3 → step 9), so nobody is sent a repeat.
update public.app_previews set seq_step = case nurture_step when 1 then 2 when 2 then 5 when 3 then 9 else seq_step end
  where nurture_step > 0 and seq_step = 0;

-- The starting schedule. Keep in sync with DEFAULT_SEQUENCE in apps/venues/lib/landing/lead-sequence.ts.
-- Only inserts missing steps, so re-running never overwrites copy edited in the admin.
insert into public.lead_sequence_steps (step, channel, name, delay_minutes, subject, preheader, body) values
(1, 'sms', 'First text', 45, null, null,
 E'Atlas Engine: {spa_name}''s app is built and waiting for you: {app_link} Want me to switch it on with you? Book 15 min: {walkthrough_link} Reply STOP to opt out.'),
(2, 'email', 'Saw you clicking around', 180,
 '{first_name}, saw you clicking around',
 'Like what you see? This is just the start.',
 E'Hey {first_name},\n\nIt''s {spa_name}''s app. Yes, the one we built you.\n\nSaw you''ve been clicking around.\n\nLike what you see?\n\nI bet you do...\n\nBut right now I''m only a preview. I can''t save anything, and your patients can''t join me yet.\n\nSwitch me on and I start doing the work:\n- Reminding patients before their treatment wears off\n- Selling memberships that bill every month\n- Sending birthday and win-back gifts on my own\n\nIt takes one 15-minute call. Andrew switches me on with you, live:\n{walkthrough_link}\n\nTalk soon,\n{spa_name}''s app\n(sent by Andrew at Atlas Engine)'),
(3, 'call', 'First call', 300, null, null,
 E'Hi, is this the owner of {spa_name}? It''s Andrew from Atlas Engine. You built your patient app on our site earlier today. Did it pull your logo and treatments right?\n\nIf yes: the next step is a 15-minute walkthrough where we switch it on together. Does tomorrow or the day after work?\nIf no answer: leave a 20-second voicemail (who you are, their app, the link is in their email) and mark "Voicemail".'),
(4, 'sms', 'Next-day text', 1440, null, null,
 E'Atlas Engine: did {spa_name}''s app look right? If the logo or color is off, fix it in one tap on your preview: {app_link} Reply STOP to opt out.'),
(5, 'email', 'Why not switch me on?', 2880,
 '{spa_name}''s app here. Did you forget about me?',
 'You built me, then left me in preview.',
 E'Oh, hi {first_name}!\n\nJust checking in. I noticed you built me, {spa_name}''s own patient app, but I''m still sitting in preview.\n\nThat''s weird.\n\nWhy wouldn''t you want me?\n\nI''d be reminding every patient who''s due for a touch-up...\nTurning one-time visits into monthly members...\nAnd getting you more Google reviews while you''re busy with patients.\n\nMaybe you''re waiting for the perfect moment. Smart.\n\nBut a gentle reminder: the patients who are due right now only come back if someone reminds them. That''s my whole job.\n\nQuick math. Your average treatment is about {avg_ticket}. If I bring back just 10 patients a month who were due, that''s {ten_rebooks}. Every month.\n\nWhen you''re ready, book 15 minutes and we switch me on together:\n{walkthrough_link}\n\nYours,\n{spa_name}''s app'),
(6, 'call', 'Second call', 4320, null, null,
 E'Second try. Lead with their numbers: "At {avg_ticket} a visit, ten patients coming back on time is {ten_rebooks} a month. Can I show you how it does that in 15 minutes?"\n\nBook it on the call if they say yes. No answer: no voicemail this time, mark "No answer".'),
(7, 'sms', 'Day 4 text', 5760, null, null,
 E'Atlas Engine: quick one. At {avg_ticket} a visit, 10 patients coming back on time is {ten_rebooks}/mo for {spa_name}. 15 min to switch it on: {walkthrough_link} Reply STOP to opt out.'),
(8, 'email', 'What the front desk does', 8640,
 'What {spa_name}''s front desk would do this week',
 'Three things, on its own, every week.',
 E'{first_name},\n\nHere''s what {spa_name}''s front desk would have done this week if it were switched on:\n\n- Texted every patient whose Botox or filler is wearing off, before they book somewhere else\n- Asked your happiest patients for a Google review, with points as the thank-you\n- Sent a birthday gift to everyone with a birthday this week\n\nNone of it needs your team to remember anything.\n\nSee it in your desk:\n{desk_link}\n\n{spa_name}''s app'),
(9, 'email', 'Break-up', 11520,
 'Last chance: I''m deleted on {expires_on}',
 'You saw what I can do. Don''t let me go.',
 E'{first_name},\n\nYou saw what I can do.\n\nYour logo. Your treatments. Your patients'' app, on their phones.\n\nAnd I know you liked it.\n\nBut you haven''t switched me on yet, and on {expires_on} your preview gets deleted.\n\nYou won''t let me go without a fight, will you?\n\nDidn''t think so.\n\nBook 15 minutes here and I''m live for {spa_name}:\n{walkthrough_link}\n\nSincerely yours,\n{spa_name}''s app'),
(10, 'email', 'Nurture', 20160,
 '{spa_name}: one idea for your slow days',
 'No pitch. Just the one thing that works.',
 E'{first_name},\n\nOne idea, no pitch.\n\nThe fastest way to fill a slow week at a med spa isn''t a discount. It''s the patients who are already due: their Botox wore off three weeks ago and nobody asked them back.\n\nPull a list of everyone whose last neurotoxin visit was 13 to 16 weeks ago and text them today. Most practices get a few bookings the same afternoon.\n\nWhen you want that to happen on its own, every week, it''s 15 minutes to set up:\n{walkthrough_link}\n\nAndrew, Atlas Engine')
on conflict (step) do nothing;

-- Copy the admin's own edits of the three CP-238 emails onto their new steps (only edited ones).
update public.lead_sequence_steps s set subject = e.subject, preheader = e.preheader, body = e.body, enabled = e.enabled, updated_at = now()
  from public.lead_email_steps e
  where e.updated_by is not null and s.updated_by is null
    and s.step = case e.step when 1 then 2 when 2 then 5 when 3 then 9 end;
