-- CP-216 · Automation Hub · 01 tables, flags, RLS
-- APPLIED to production Oct 23 2026 via the Supabase MCP (migration cp216_01_tables). Safe to re-run.

create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
insert into public.app_settings (key, value) values ('automation_engine', 'off') on conflict (key) do nothing;

create table if not exists public.customer_events (
  id bigserial primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  membership_id uuid references public.business_memberships(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  dedupe_key text not null
);
create unique index if not exists customer_events_dedupe on public.customer_events (business_id, type, dedupe_key);
create index if not exists customer_events_member on public.customer_events (business_id, membership_id, type, occurred_at desc);

create table if not exists public.workflows (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  family text,
  status text not null default 'draft' check (status in ('draft','testing','active','paused','archived','error')),
  current_version_id uuid,
  reentry_days int not null default 30,
  template_key text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists workflows_business on public.workflows (business_id, status);

create table if not exists public.workflow_versions (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  version int not null,
  graph jsonb not null,
  notes text,
  published_at timestamptz,
  published_by uuid,
  created_at timestamptz not null default now(),
  unique (workflow_id, version)
);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'workflows_current_version_fk') then
    alter table public.workflows add constraint workflows_current_version_fk
      foreign key (current_version_id) references public.workflow_versions(id) on delete set null;
  end if;
end $$;

create table if not exists public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  version_id uuid not null references public.workflow_versions(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  membership_id uuid not null references public.business_memberships(id) on delete cascade,
  status text not null default 'running' check (status in ('running','waiting','done','exited','error')),
  current_node_id text,
  wake_at timestamptz not null default now(),
  waiting_since timestamptz,
  attempt int not null default 0,
  steps_taken int not null default 0,
  goal text,
  entered_at timestamptz not null default now(),
  exited_at timestamptz,
  exit_reason text,
  last_error text,
  entry_event_id bigint,
  unique (workflow_id, membership_id, entry_event_id)
);
create index if not exists workflow_runs_due on public.workflow_runs (business_id, wake_at) where status in ('running','waiting');
create index if not exists workflow_runs_member on public.workflow_runs (membership_id, status);
create index if not exists workflow_runs_wf on public.workflow_runs (workflow_id, status);

create table if not exists public.workflow_run_steps (
  id bigserial primary key,
  run_id uuid not null references public.workflow_runs(id) on delete cascade,
  node_id text not null,
  node_type text not null,
  result text not null check (result in ('ok','yes','no','skipped','waiting','deferred','error','exit')),
  detail jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
create index if not exists workflow_run_steps_run on public.workflow_run_steps (run_id, at);
create index if not exists workflow_run_steps_node on public.workflow_run_steps (node_id, at desc);

create table if not exists public.customer_tags (
  business_id uuid not null references public.businesses(id) on delete cascade,
  membership_id uuid not null references public.business_memberships(id) on delete cascade,
  tag text not null,
  source_run_id uuid,
  created_at timestamptz not null default now(),
  primary key (business_id, membership_id, tag)
);

create table if not exists public.business_automation_settings (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  enabled boolean not null default false,
  quiet_start time not null default '10:00',
  quiet_end time not null default '20:00',
  max_msgs_per_member_per_week int not null default 3,
  test_membership_ids uuid[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists public.member_comm_prefs (
  membership_id uuid primary key references public.business_memberships(id) on delete cascade,
  email_opt_out_at timestamptz,
  sms_consent_at timestamptz,
  paused_until timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.workflow_node_stats (
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  version_id uuid not null,
  node_id text not null,
  day date not null,
  reached int not null default 0, completed int not null default 0, waiting int not null default 0,
  sent int not null default 0, delivered int not null default 0, failed int not null default 0, converted int not null default 0,
  primary key (workflow_id, version_id, node_id, day)
);

-- Additive columns on notifications (legacy bridge)
alter table public.notifications add column if not exists source text;
alter table public.notifications add column if not exists family text;
alter table public.notifications add column if not exists workflow_run_id uuid;
alter table public.notifications add column if not exists workflow_node_id text;
alter table public.notifications add column if not exists idempotency_key text;
create unique index if not exists notifications_idem on public.notifications (idempotency_key) where idempotency_key is not null;
create index if not exists notifications_family on public.notifications (user_id, business_id, family, created_at desc) where family is not null;

-- RLS: agency admins only. The engine runs inside SECURITY DEFINER functions.
-- (No DROP statements: the hosted migration runner asks for confirmation on those.)
do $$ declare t text; begin
  foreach t in array array['app_settings','customer_events','workflows','workflow_versions','workflow_runs','workflow_run_steps','customer_tags','business_automation_settings','member_comm_prefs','workflow_node_stats'] loop
    execute format('alter table public.%I enable row level security', t);
    if not exists (select 1 from pg_policies where tablename = t and policyname = t || '_admin') then
      execute format('create policy %I on public.%I for all using (public.is_agency_admin()) with check (public.is_agency_admin())', t || '_admin', t);
    end if;
  end loop;
  -- Members may read their own tags (future app use); nothing else is readable by customers.
  if not exists (select 1 from pg_policies where tablename = 'customer_tags' and policyname = 'customer_tags_self') then
    create policy customer_tags_self on public.customer_tags for select using (
      exists (select 1 from public.business_memberships m where m.id = customer_tags.membership_id and m.user_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_workflows_updated') then
    create trigger trg_workflows_updated before update on public.workflows for each row execute function public.set_updated_at();
  end if;
end $$;
