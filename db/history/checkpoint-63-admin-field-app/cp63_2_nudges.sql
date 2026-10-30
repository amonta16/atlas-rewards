-- =====================================================================
-- CHECKPOINT 63 — Atlas Command · Phase 2 (Daily motivational nudges)
-- =====================================================================
-- A daily "let's build apps today" nudge for the door-sales crew, delivered
-- each morning as an in-app bell notification (admin_notifications) AND a
-- phone push. Andrew edits one message per weekday in the Admin App tab.
--
-- This migration adds:
--   1. Nudge config columns on admin_app_config (enabled + 7 weekday msgs).
--   2. admin_notifications — the reps' own bell feed (separate from the
--      customer `notifications` table, so nothing here touches that system).
--   3. set_admin_nudges() — owner edits the schedule/messages.
--
-- The actual fan-out (insert rows + web-push) happens in the Next.js route
-- /api/admin-app/daily-nudge, called by a Vercel Cron each morning. No DB
-- cron needed.
--
-- Apply AFTER cp63_migration.sql. Idempotent.
-- =====================================================================


-- =====================================================================
-- 1. NUDGE CONFIG on admin_app_config
-- =====================================================================
alter table public.admin_app_config
  add column if not exists nudges_enabled boolean not null default true,
  add column if not exists nudge_hour     int not null default 8,   -- display hint; Vercel Cron sets real time
  add column if not exists nudge_mon text,
  add column if not exists nudge_tue text,
  add column if not exists nudge_wed text,
  add column if not exists nudge_thu text,
  add column if not exists nudge_fri text,
  add column if not exists nudge_sat text,
  add column if not exists nudge_sun text;

-- Seed friendly defaults only where still null (won't clobber edits).
update public.admin_app_config set
  nudge_mon = coalesce(nudge_mon, 'New week, new apps. Let''s lock in. 🔒'),
  nudge_tue = coalesce(nudge_tue, 'Momentum Tuesday — who are we closing today? 💪'),
  nudge_wed = coalesce(nudge_wed, 'Midweek grind. Every door is a maybe. 🚪'),
  nudge_thu = coalesce(nudge_thu, 'Almost there — stack a few more demos today. ⚡'),
  nudge_fri = coalesce(nudge_fri, 'Finish strong. The weekend is earned, not given. 🏁'),
  nudge_sat = coalesce(nudge_sat, 'Weekend warriors — a few pitches now = MRR later. ☀️'),
  nudge_sun = coalesce(nudge_sun, 'Reset & plan. Tomorrow we build. 🧠')
where id = 1;


-- =====================================================================
-- 2. ADMIN NOTIFICATIONS — the reps' bell feed
-- =====================================================================
create table if not exists public.admin_notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  title      text not null,
  body       text,
  kind       text not null default 'nudge',
  link_path  text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists admin_notif_user_recent on public.admin_notifications (user_id, created_at desc);
create index if not exists admin_notif_user_unread on public.admin_notifications (user_id) where read_at is null;

alter table public.admin_notifications enable row level security;

-- Each rep sees + marks read only their own. Inserts come from the API
-- route via the service-role client (bypasses RLS), so no insert policy.
drop policy if exists admin_notif_owner_select on public.admin_notifications;
create policy admin_notif_owner_select on public.admin_notifications
  for select using (user_id = auth.uid());

drop policy if exists admin_notif_owner_update on public.admin_notifications;
create policy admin_notif_owner_update on public.admin_notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Realtime so the bell badge updates live (best-effort).
do $$ begin
  alter publication supabase_realtime add table public.admin_notifications;
exception when duplicate_object then null; when undefined_object then null;
end $$;
alter table public.admin_notifications replica identity full;


-- =====================================================================
-- 3. set_admin_nudges — owner edits the schedule + messages
-- =====================================================================
create or replace function public.set_admin_nudges(
  p_enabled boolean default null,
  p_hour    int     default null,
  p_mon text default null, p_tue text default null, p_wed text default null,
  p_thu text default null, p_fri text default null, p_sat text default null,
  p_sun text default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_agency_owner() then raise exception 'only the agency owner can edit nudges'; end if;
  update public.admin_app_config set
    nudges_enabled = coalesce(p_enabled, nudges_enabled),
    nudge_hour     = coalesce(p_hour, nudge_hour),
    nudge_mon = coalesce(p_mon, nudge_mon),
    nudge_tue = coalesce(p_tue, nudge_tue),
    nudge_wed = coalesce(p_wed, nudge_wed),
    nudge_thu = coalesce(p_thu, nudge_thu),
    nudge_fri = coalesce(p_fri, nudge_fri),
    nudge_sat = coalesce(p_sat, nudge_sat),
    nudge_sun = coalesce(p_sun, nudge_sun),
    updated_at = now()
  where id = 1;
end; $$;
grant execute on function public.set_admin_nudges(boolean, int, text, text, text, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- CP-63 Phase 2 done. Apply after cp63_migration.sql.
-- Set env CRON_SECRET and add the Vercel Cron (see README) to fire the
-- morning nudge at /api/admin-app/daily-nudge.
-- =====================================================================
