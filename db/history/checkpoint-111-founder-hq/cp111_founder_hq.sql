-- =====================================================================
-- CP-111 — Founder Headquarters + Revenue Analytics
-- =====================================================================
-- Apply AFTER cp110_security_hardening.sql. Idempotent — safe to re-run.
--
-- WHAT THIS SHIPS
--   PART A — agency_pipeline upgrade (non-destructive):
--       door-to-door sales stages, lead source, owner, win probability,
--       follow-up dates, open/won/lost/archived status. Existing rows are
--       remapped to the new stages; the original stage value is preserved
--       in the new `legacy_stage` column so nothing is lost.
--   PART B — Founder HQ tables (all agency-admin only via RLS):
--       founder_meetings, field_sales_events, founder_action_items,
--       agency_sales_activity (daily door-to-door scorecard),
--       agency_mrr_snapshots (append-only revenue history).
--   PART C — agency_settings gains recordings_folder_url (editable in the
--       UI — seeded with the current Google Drive folder) and
--       agency_timezone (drives every date shown on HQ/Analytics).
--   PART D — RPCs:
--       list_agency_admins()             — founder picker options
--       pipeline_default_probability()   — stage → default win %
--       record_agency_revenue_snapshot() — upserts TODAY's snapshot only
--       agency_live_mrr_daily(p_days)    — live-MRR history derived from
--                                          real subscription start/cancel
--                                          dates (never fabricated)
--
-- CALCULATION RULES (must match lib/founder-hq.ts):
--   Live MRR       = sum(monthly_cents) of agency_billing_subscriptions
--                    with status = 'active'  (verified paying clients)
--   Raw pipeline   = sum(est_monthly_cents) of agency_pipeline rows with
--                    status='open', EXCLUDING rows whose converted
--                    business already has an active/past_due subscription
--                    (no double counting)
--   Weighted       = same rows, est_monthly_cents × win probability
--                    (per-row value, else the stage default below)
-- =====================================================================

create extension if not exists pgcrypto with schema public;

-- =====================================================================
-- PART A — AGENCY PIPELINE UPGRADE
-- =====================================================================
alter table public.agency_pipeline
  add column if not exists legacy_stage        text,
  add column if not exists status              text not null default 'open',
  add column if not exists owner_user_id       uuid,
  add column if not exists lead_source         text not null default 'door_to_door',
  add column if not exists win_probability     int,
  add column if not exists expected_close_date date,
  add column if not exists last_contact_date   date,
  add column if not exists next_followup_date  date,
  add column if not exists next_action         text,
  add column if not exists closed_at           timestamptz,
  add column if not exists updated_by          uuid;

-- Widen the stage CHECK to the new door-to-door stages. The legacy values
-- stay legal so a stale client tab can never hard-fail a write.
alter table public.agency_pipeline drop constraint if exists agency_pipeline_stage_check;
alter table public.agency_pipeline add constraint agency_pipeline_stage_check
  check (stage in (
    'prepared_app','business_contacted','demo_completed','follow_up',
    'trial_proposal','verbal_commitment','won','lost',
    -- legacy CP-50 values (remapped below, but still legal):
    'lead','contacted','in_talks','proposal'
  ));

alter table public.agency_pipeline drop constraint if exists agency_pipeline_status_check;
alter table public.agency_pipeline add constraint agency_pipeline_status_check
  check (status in ('open','won','lost','archived'));

alter table public.agency_pipeline drop constraint if exists agency_pipeline_source_check;
alter table public.agency_pipeline add constraint agency_pipeline_source_check
  check (lead_source in ('door_to_door','instagram','youtube','paid_ads','referral','other'));

alter table public.agency_pipeline drop constraint if exists agency_pipeline_prob_check;
alter table public.agency_pipeline add constraint agency_pipeline_prob_check
  check (win_probability is null or (win_probability >= 0 and win_probability <= 100));

-- One-time remap of legacy stages (original value kept in legacy_stage).
update public.agency_pipeline
   set legacy_stage = stage
 where legacy_stage is null
   and stage in ('lead','contacted','in_talks','proposal');

update public.agency_pipeline
   set stage = case stage
                 when 'lead'      then 'prepared_app'
                 when 'contacted' then 'business_contacted'
                 when 'in_talks'  then 'follow_up'
                 when 'proposal'  then 'trial_proposal'
                 else stage
               end
 where stage in ('lead','contacted','in_talks','proposal');

-- Derive status for pre-existing rows (default 'open' covers the rest).
update public.agency_pipeline
   set status = stage
 where status = 'open' and stage in ('won','lost');

update public.agency_pipeline
   set closed_at = coalesce(closed_at, updated_at)
 where status in ('won','lost') and closed_at is null;

create index if not exists agency_pipeline_status_idx
  on public.agency_pipeline(status, next_followup_date);

-- =====================================================================
-- PART B — FOUNDER HQ TABLES (agency_admin only)
-- =====================================================================

-- ---- High-priority founder meetings ---------------------------------
create table if not exists public.founder_meetings (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  meeting_date   date not null,
  start_time     time not null,
  end_time       time,
  meeting_url    text,
  recording_url  text,
  participants   text[] not null default '{}',
  agenda         text,
  priority       text not null default 'normal' check (priority in ('normal','high')),
  status         text not null default 'upcoming' check (status in ('upcoming','completed','cancelled')),
  created_by     uuid default auth.uid(),
  updated_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists founder_meetings_when_idx
  on public.founder_meetings(status, meeting_date, start_time);

-- ---- Field-sales (door-to-door) calendar ----------------------------
create table if not exists public.field_sales_events (
  id          uuid primary key default gen_random_uuid(),
  event_date  date not null,
  start_time  time,
  end_time    time,
  members     text[] not null default '{}',
  city        text not null,
  location    text,
  notes       text,
  status      text not null default 'planned' check (status in ('planned','completed','cancelled')),
  created_by  uuid default auth.uid(),
  updated_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists field_sales_events_date_idx
  on public.field_sales_events(event_date);

-- ---- Goals & action items -------------------------------------------
create table if not exists public.founder_action_items (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  description    text,
  owner_user_id  uuid,
  owner_name     text,
  due_date       date,
  priority       text not null default 'normal' check (priority in ('low','normal','high')),
  status         text not null default 'not_started'
                   check (status in ('not_started','in_progress','blocked','completed')),
  meeting_id     uuid references public.founder_meetings(id) on delete set null,
  completed_at   timestamptz,
  created_by     uuid default auth.uid(),
  updated_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists founder_action_items_state_idx
  on public.founder_action_items(status, due_date);

-- ---- Daily door-to-door activity scorecard --------------------------
-- One row per day (unique) — two admins editing the same day upsert into
-- the same row instead of creating duplicates.
create table if not exists public.agency_sales_activity (
  id                   uuid primary key default gen_random_uuid(),
  activity_date        date not null unique,
  businesses_visited   int not null default 0 check (businesses_visited   >= 0),
  decision_makers      int not null default 0 check (decision_makers      >= 0),
  demos_presented      int not null default 0 check (demos_presented      >= 0),
  followups_scheduled  int not null default 0 check (followups_scheduled  >= 0),
  proposals_created    int not null default 0 check (proposals_created    >= 0),
  deals_won            int not null default 0 check (deals_won            >= 0),
  notes                text,
  created_by           uuid default auth.uid(),
  updated_by           uuid,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ---- Revenue history snapshots (append-only from the app's view) ----
create table if not exists public.agency_mrr_snapshots (
  snapshot_date            date primary key,
  live_mrr_cents           bigint not null default 0,
  pipeline_raw_cents       bigint not null default 0,
  pipeline_weighted_cents  bigint not null default 0,
  active_clients           int    not null default 0,
  open_opportunities       int    not null default 0,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- ---- RLS -------------------------------------------------------------
alter table public.founder_meetings      enable row level security;
alter table public.field_sales_events    enable row level security;
alter table public.founder_action_items  enable row level security;
alter table public.agency_sales_activity enable row level security;
alter table public.agency_mrr_snapshots  enable row level security;

do $$ begin
  begin drop policy "founder_meetings_admin"     on public.founder_meetings;      exception when undefined_object then null; end;
  begin drop policy "field_sales_events_admin"   on public.field_sales_events;    exception when undefined_object then null; end;
  begin drop policy "founder_action_items_admin" on public.founder_action_items;  exception when undefined_object then null; end;
  begin drop policy "agency_sales_activity_admin" on public.agency_sales_activity; exception when undefined_object then null; end;
  begin drop policy "agency_mrr_snapshots_read"  on public.agency_mrr_snapshots;  exception when undefined_object then null; end;
end $$;

create policy "founder_meetings_admin" on public.founder_meetings
  for all to authenticated
  using (public.is_agency_admin()) with check (public.is_agency_admin());

create policy "field_sales_events_admin" on public.field_sales_events
  for all to authenticated
  using (public.is_agency_admin()) with check (public.is_agency_admin());

create policy "founder_action_items_admin" on public.founder_action_items
  for all to authenticated
  using (public.is_agency_admin()) with check (public.is_agency_admin());

create policy "agency_sales_activity_admin" on public.agency_sales_activity
  for all to authenticated
  using (public.is_agency_admin()) with check (public.is_agency_admin());

-- Snapshots: admins can READ; writes only through the SECURITY DEFINER
-- RPC below — history can't be rewritten from the browser.
create policy "agency_mrr_snapshots_read" on public.agency_mrr_snapshots
  for select to authenticated
  using (public.is_agency_admin());

-- ---- updated_at triggers ---------------------------------------------
drop trigger if exists trg_founder_meetings_updated on public.founder_meetings;
create trigger trg_founder_meetings_updated before update on public.founder_meetings
  for each row execute function public.set_updated_at();

drop trigger if exists trg_field_sales_events_updated on public.field_sales_events;
create trigger trg_field_sales_events_updated before update on public.field_sales_events
  for each row execute function public.set_updated_at();

drop trigger if exists trg_founder_action_items_updated on public.founder_action_items;
create trigger trg_founder_action_items_updated before update on public.founder_action_items
  for each row execute function public.set_updated_at();

drop trigger if exists trg_agency_sales_activity_updated on public.agency_sales_activity;
create trigger trg_agency_sales_activity_updated before update on public.agency_sales_activity
  for each row execute function public.set_updated_at();

-- ---- updated_by stamping (who last edited a shared record) ----------
create or replace function public.hq_stamp_updated_by()
returns trigger language plpgsql as $$
begin
  new.updated_by := auth.uid();
  return new;
end; $$;

drop trigger if exists trg_founder_meetings_by on public.founder_meetings;
create trigger trg_founder_meetings_by before update on public.founder_meetings
  for each row execute function public.hq_stamp_updated_by();

drop trigger if exists trg_field_sales_events_by on public.field_sales_events;
create trigger trg_field_sales_events_by before update on public.field_sales_events
  for each row execute function public.hq_stamp_updated_by();

drop trigger if exists trg_founder_action_items_by on public.founder_action_items;
create trigger trg_founder_action_items_by before update on public.founder_action_items
  for each row execute function public.hq_stamp_updated_by();

drop trigger if exists trg_agency_sales_activity_by on public.agency_sales_activity;
create trigger trg_agency_sales_activity_by before update on public.agency_sales_activity
  for each row execute function public.hq_stamp_updated_by();

drop trigger if exists trg_agency_pipeline_by on public.agency_pipeline;
create trigger trg_agency_pipeline_by before update on public.agency_pipeline
  for each row execute function public.hq_stamp_updated_by();

-- =====================================================================
-- PART C — AGENCY SETTINGS (recordings library + timezone)
-- =====================================================================
alter table public.agency_settings
  add column if not exists recordings_folder_url text,
  add column if not exists agency_timezone       text not null default 'America/Los_Angeles';

-- Seed the current Drive folder once; afterwards it's editable in the UI
-- (Headquarters → Meetings → Recordings library → pencil).
update public.agency_settings
   set recordings_folder_url = 'https://drive.google.com/drive/folders/1zkDA4M5AZn89So5txPUwFOWi-qrd50aG?usp=sharing'
 where id = 1
   and (recordings_folder_url is null or recordings_folder_url = '');

-- =====================================================================
-- PART D — RPCs
-- =====================================================================

-- Founder / owner picker options.
create or replace function public.list_agency_admins()
returns table (user_id uuid, email text, full_name text)
language sql stable security definer set search_path = public as $$
  select distinct bu.user_id, p.email, p.full_name
    from public.business_users bu
    join public.profiles p on p.id = bu.user_id
   where bu.role = 'agency_admin'
     and public.is_agency_admin()
   order by 3 nulls last, 2;
$$;
grant execute on function public.list_agency_admins() to authenticated;

-- Stage → default win probability. MUST stay in sync with
-- STAGE_DEFAULT_PROBABILITY in lib/founder-hq.ts.
create or replace function public.pipeline_default_probability(p_stage text)
returns int
language sql immutable as $$
  select case p_stage
    when 'prepared_app'       then 5
    when 'business_contacted' then 10
    when 'demo_completed'     then 25
    when 'follow_up'          then 35
    when 'trial_proposal'     then 55
    when 'verbal_commitment'  then 80
    when 'won'                then 100
    when 'lost'               then 0
    else 10
  end;
$$;
grant execute on function public.pipeline_default_probability(text) to authenticated;

-- Upserts TODAY's revenue snapshot (agency timezone). Never touches any
-- earlier date, so genuine history is immutable.
create or replace function public.record_agency_revenue_snapshot()
returns table (
  snapshot_date            date,
  live_mrr_cents           bigint,
  pipeline_raw_cents       bigint,
  pipeline_weighted_cents  bigint,
  active_clients           int,
  open_opportunities       int
)
language plpgsql security definer set search_path = public as $$
declare
  v_tz       text;
  v_today    date;
  v_live     bigint;
  v_active   int;
  v_raw      bigint;
  v_weighted bigint;
  v_open     int;
begin
  if not public.is_agency_admin() then
    raise exception 'agency admins only';
  end if;

  select coalesce(s.agency_timezone, 'America/Los_Angeles') into v_tz
    from public.agency_settings s where s.id = 1;
  v_today := (now() at time zone coalesce(v_tz, 'America/Los_Angeles'))::date;

  select coalesce(sum(s.monthly_cents), 0)::bigint, count(*)::int
    into v_live, v_active
    from public.agency_billing_subscriptions s
   where s.status = 'active';

  select coalesce(sum(p.est_monthly_cents), 0)::bigint,
         coalesce(sum(round(p.est_monthly_cents
             * coalesce(p.win_probability, public.pipeline_default_probability(p.stage))
             / 100.0)), 0)::bigint,
         count(*)::int
    into v_raw, v_weighted, v_open
    from public.agency_pipeline p
   where p.status = 'open'
     and not exists (
           select 1 from public.agency_billing_subscriptions s
            where s.business_id = p.converted_business_id
              and s.status in ('active','past_due')
         );

  insert into public.agency_mrr_snapshots as ms
         (snapshot_date, live_mrr_cents, pipeline_raw_cents,
          pipeline_weighted_cents, active_clients, open_opportunities)
  values (v_today, v_live, v_raw, v_weighted, v_active, v_open)
  -- NB: named constraint, not "(snapshot_date)" — the OUT column of this
  -- function shadows the column name inside plpgsql (the CP-73.1 lesson).
  on conflict on constraint agency_mrr_snapshots_pkey do update
     set live_mrr_cents          = excluded.live_mrr_cents,
         pipeline_raw_cents      = excluded.pipeline_raw_cents,
         pipeline_weighted_cents = excluded.pipeline_weighted_cents,
         active_clients          = excluded.active_clients,
         open_opportunities      = excluded.open_opportunities,
         updated_at              = now();

  return query
    select ms2.snapshot_date, ms2.live_mrr_cents, ms2.pipeline_raw_cents,
           ms2.pipeline_weighted_cents, ms2.active_clients, ms2.open_opportunities
      from public.agency_mrr_snapshots ms2
     where ms2.snapshot_date = v_today;
end; $$;
grant execute on function public.record_agency_revenue_snapshot() to authenticated;

-- Daily live-MRR history reconstructed from REAL subscription lifecycle
-- fields (started_at / canceled_at) — the same source the CP-50 monthly
-- timeseries uses, at day resolution. Canceled subs keep contributing to
-- the days they were actually live. Nothing is fabricated.
create or replace function public.agency_live_mrr_daily(p_days int default 90)
returns table (day date, mrr_cents bigint)
language sql stable security definer set search_path = public as $$
  with days as (
    select (current_date - g) as day
      from generate_series(greatest(0, least(p_days, 730)) - 1, 0, -1) g
  )
  select d.day,
         coalesce((
           select sum(s.monthly_cents)::bigint
             from public.agency_billing_subscriptions s
            where (s.status in ('active','past_due')
                   or (s.status = 'canceled' and s.canceled_at is not null))
              and s.started_at::date <= d.day
              and (s.canceled_at is null or s.canceled_at::date > d.day)
         ), 0) as mrr_cents
    from days d
   where public.is_agency_admin()
   order by d.day;
$$;
grant execute on function public.agency_live_mrr_daily(int) to authenticated;

-- =====================================================================
-- Done. After applying, hard-refresh the dashboard: Headquarters and the
-- new Revenue Analytics read every number from these tables/RPCs.
-- =====================================================================
