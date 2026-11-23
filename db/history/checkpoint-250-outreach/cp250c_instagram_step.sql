-- CP-250c · A manual Instagram DM step in the outreach sequence. Additive and safe to re-run.
-- Applied to production 2026-11-22 as migration cp250c_instagram_step (comments trimmed; same statements).
--
-- Nothing is sent automatically: automated Instagram (or LinkedIn) messaging breaks those platforms' terms
-- and risks the account. When the step is due, the spa shows up on To-do with its Instagram link, a short DM
-- Claude drafted from its website (no links, under ~300 characters) and a Copy button. You send it yourself
-- from the Atlas account and log how it went:
--   Sent · Replied · Not interested · Booked · No IG
-- Replied, Not interested and Booked stop the sequence (like calls). No IG clears the handle. A spa with no
-- handle skips the step.
--
--   outreach_leads.instagram   the handle (no @), found in the links on their website or typed in the drawer
--   outreach_leads.ig_dm       the DM Claude drafted when it read the site
--   outreach_steps.kind        + 'instagram_dm'
--   outreach_tasks.kind        + 'instagram_dm';  outcome + 'sent', 'replied', 'no_ig'
--
-- The sequence changes only where it is still exactly the CP-250b seed and nothing has been drafted or sent:
--   email day 0 → IG DM day 2 → follow-up email day 3 → call day 5 → last note day 7
--
-- Undo:
--   alter table public.outreach_leads drop column if exists instagram, drop column if exists ig_dm;
--   (put the CP-250b kind/outcome checks back once no step or task uses the new values)

alter table public.outreach_leads add column if not exists instagram text check (instagram is null or instagram ~ '^[a-z0-9._]{1,30}$');
alter table public.outreach_leads add column if not exists ig_dm text check (ig_dm is null or char_length(ig_dm) <= 500);

alter table public.outreach_steps drop constraint if exists outreach_steps_kind_check;
alter table public.outreach_steps add constraint outreach_steps_kind_check check (kind in ('email', 'call', 'instagram_dm'));

alter table public.outreach_tasks drop constraint if exists outreach_tasks_kind_check;
alter table public.outreach_tasks add constraint outreach_tasks_kind_check check (kind in ('call', 'instagram_dm'));
alter table public.outreach_tasks drop constraint if exists outreach_tasks_outcome_check;
alter table public.outreach_tasks add constraint outreach_tasks_outcome_check check (outcome is null or outcome in (
  'talked', 'voicemail', 'no_answer', 'not_interested', 'booked', 'skipped',
  'sent', 'replied', 'no_ig'));

do $$
begin
  if not exists (select 1 from public.outreach_steps where step = 5)
     and not exists (select 1 from public.outreach_steps where kind = 'instagram_dm')
     and not exists (select 1 from public.outreach_messages)
     and not exists (select 1 from public.outreach_tasks)
     and (select string_agg(step || ':' || kind || ':' || delay_days, ' ' order by step) from public.outreach_steps)
         = '1:email:0 2:email:3 3:call:2 4:email:2' then
    update public.outreach_steps set step = 5, updated_at = now() where step = 4;
    update public.outreach_steps set step = 4, updated_at = now() where step = 3;
    update public.outreach_steps set step = 3, delay_days = 1, updated_at = now() where step = 2;
    insert into public.outreach_steps (step, name, delay_days, subject, body, ai, enabled, kind) values
      (2, 'Instagram DM', 2, '',
       E'Hi! I''m Andrew from Atlas Engine. I build branded patient apps for med spas, and I emailed {spa_name} this week about one. Would a quick preview of what yours could look like be useful?',
       false, true, 'instagram_dm');
  end if;
end $$;
