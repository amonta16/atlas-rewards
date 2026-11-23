-- CP-250b · Outreach upgrades (after comparing with the Origami founder walkthrough). Additive and safe to re-run.
-- Applied to production 2026-11-22 as migration cp250b_outreach_upgrades (comments trimmed; same statements).
--
--   1. Fit check     outreach_leads.fit ('good' | 'unsure' | 'no') + fit_reason, set by Claude when it reads the site
--   2. Opener mode   outreach_settings.write_mode: 'opener' = Claude writes only the personal opening line ({opener}),
--                    the rest is your template; 'full' = Claude writes the whole email (v1 behaviour).
--                    outreach_messages.ai_line keeps the line Claude wrote, so Review can show it.
--   3. Notes         outreach_settings.writing_notes: standing notes every draft follows.
--                    outreach_messages.edited: you changed it by hand, so "Redraft all" leaves it alone.
--   4. Later         new lead status 'later' + outreach_leads.recontact_at: "not now" replies come back on a date.
--   5. Call step     outreach_steps.kind ('email' | 'call') and outreach_tasks: a call step puts the spa on your
--                    To-do list with its number and a script, instead of sending an email.
--   6. In Atlas      no schema: the engine skips spas that already have an Atlas app (client or demo).
--
-- The seeded sequence changes only where it still matches the CP-250 seed exactly (nothing has been sent yet):
--   step 1 gets the {opener} line; the "Last note" email moves to step 4 and step 3 becomes a call.
--
-- Undo:
--   drop table if exists public.outreach_tasks;
--   alter table public.outreach_leads drop column if exists fit, drop column if exists fit_reason, drop column if exists recontact_at;
--   alter table public.outreach_messages drop column if exists ai_line, drop column if exists edited;
--   alter table public.outreach_steps drop column if exists kind;
--   alter table public.outreach_settings drop column if exists write_mode, drop column if exists writing_notes;
--   (and put the CP-250 status check back without 'later' once no lead uses it)

-- 1 · fit, 4 · later
alter table public.outreach_leads add column if not exists fit text check (fit is null or fit in ('good', 'unsure', 'no'));
alter table public.outreach_leads add column if not exists fit_reason text check (fit_reason is null or char_length(fit_reason) <= 200);
alter table public.outreach_leads add column if not exists recontact_at date;

alter table public.outreach_leads drop constraint if exists outreach_leads_status_check;
alter table public.outreach_leads add constraint outreach_leads_status_check check (status in (
  'new', 'no_email', 'review', 'queued', 'contacted', 'done',
  'replied', 'booked', 'not_interested', 'bounced', 'unsubscribed', 'stopped',
  'later'));                                   -- said "not now": re-contact on recontact_at

-- 2 · 3 · what Claude wrote, and whether you edited it
alter table public.outreach_messages add column if not exists ai_line text check (ai_line is null or char_length(ai_line) <= 600);
alter table public.outreach_messages add column if not exists edited boolean not null default false;

alter table public.outreach_settings add column if not exists write_mode text not null default 'opener' check (write_mode in ('opener', 'full'));
alter table public.outreach_settings add column if not exists writing_notes text not null default '' check (char_length(writing_notes) <= 1000);

-- 5 · call steps and the To-do list
alter table public.outreach_steps add column if not exists kind text not null default 'email' check (kind in ('email', 'call'));

create table if not exists public.outreach_tasks (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.outreach_leads(id) on delete cascade,
  kind        text not null default 'call' check (kind in ('call')),
  step        smallint not null check (step between 1 and 10),
  script      text check (script is null or char_length(script) <= 2000),
  due_at      timestamptz not null default now(),
  done_at     timestamptz,
  outcome     text check (outcome is null or outcome in ('talked', 'voicemail', 'no_answer', 'not_interested', 'booked', 'skipped')),
  created_at  timestamptz not null default now(),
  unique (lead_id, step)
);
create index if not exists outreach_tasks_open_idx on public.outreach_tasks (due_at) where done_at is null;
alter table public.outreach_tasks enable row level security;

-- The seeded sequence, only where it is still exactly the CP-250 seed.
update public.outreach_steps
   set body = E'Hi {first_name},\n\n{opener}\n\nI build branded patient apps for med spas: your brand on their phone, each client''s treatment schedule and when they''re due next, memberships and aftercare in one place.\n\nWould it be useful if I sent over what one would look like for {spa_name}?',
       updated_at = now()
 where step = 1
   and body = E'Hi {first_name},\n\nI build branded patient apps for med spas: your brand on their phone, each client''s treatment schedule and when they''re due next, memberships and aftercare in one place.\n\nWould it be useful if I sent over what one would look like for {spa_name}?';

do $$
begin
  if not exists (select 1 from public.outreach_steps where step = 4)
     and exists (select 1 from public.outreach_steps where step = 3 and kind = 'email' and delay_days = 4
                   and body = E'Hi {first_name},\n\nI''ll leave it here so I don''t crowd your inbox. If bringing clients back on schedule is on your list this year, reply anytime and I''ll show you how {spa_name}''s app would work.\n\nThanks either way,') then
    insert into public.outreach_steps (step, name, delay_days, subject, body, ai, enabled, kind)
      select 4, name, 2, subject, body, false, enabled, 'email' from public.outreach_steps where step = 3;
    update public.outreach_steps
       set name = 'Call the front desk', kind = 'call', delay_days = 2, subject = '', ai = false, updated_at = now(),
           body = E'Hi, this is Andrew with Atlas Engine. I sent {spa_name} a couple of emails this week about a patient app: your brand on clients'' phones, with their treatment schedule and when they''re due back.\n\nWho''s the best person to talk to about that, and is there a good time to show them a quick preview?\n\nIf they''re busy: ask for the best email and say you''ll send the preview link there.'
     where step = 3;
  end if;
end $$;
