-- CP-217 · Med Spa Automation Suite · 01 schema (additive only, safe to re-run)

-- Managed (suite) workflows
alter table public.workflows add column if not exists system_key text;
alter table public.workflows add column if not exists managed boolean not null default false;
alter table public.workflows add column if not exists overrides jsonb not null default '{}'::jsonb;
create unique index if not exists workflows_business_system_key on public.workflows (business_id, system_key) where system_key is not null;

-- Who a business's automations may reach.
--   auto (default): live for real businesses; demo businesses (businesses.is_demo) and example apps
--                   (medspa_config.example = true) only reach test_membership_ids.
--   live / test:    explicit override.
alter table public.business_automation_settings add column if not exists audience text not null default 'auto';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'business_automation_settings_audience_chk') then
    alter table public.business_automation_settings add constraint business_automation_settings_audience_chk check (audience in ('auto','live','test'));
  end if;
end $$;

-- Email queue, drained by app/api/automations/email-dispatch (Vercel cron, every minute)
create table if not exists public.email_outbox (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references public.businesses(id) on delete cascade,
  membership_id    uuid references public.business_memberships(id) on delete set null,
  user_id          uuid,
  to_email         text not null,
  subject          text not null,
  preheader        text,
  heading          text,
  body             text not null,
  cta_label        text,
  cta_url          text,          -- app path (/app/book) or absolute URL; the dispatcher makes it absolute
  footnote         text,
  hero_url         text,          -- optional banner (item photo); falls back to the business hero
  workflow_run_id  uuid,
  node_id          text,
  idempotency_key  text not null unique,
  status           text not null default 'queued' check (status in ('queued','sending','sent','failed','skipped')),
  error            text,
  attempts         int not null default 0,
  created_at       timestamptz not null default now(),
  claimed_at       timestamptz,
  sent_at          timestamptz,
  provider_id      text
);
create index if not exists email_outbox_queue on public.email_outbox (status, created_at) where status in ('queued','sending');
create index if not exists email_outbox_member on public.email_outbox (membership_id, created_at);
alter table public.email_outbox enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'email_outbox' and policyname = 'email_outbox_admin') then
    create policy email_outbox_admin on public.email_outbox for all using (public.is_agency_admin()) with check (public.is_agency_admin());
  end if;
end $$;

-- Saved legacy switch values, so turning a suite journey off restores exactly what the business had.
create table if not exists public.suite_legacy_saved (
  business_id uuid not null references public.businesses(id) on delete cascade,
  key         text not null,
  saved       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  primary key (business_id, key)
);
alter table public.suite_legacy_saved enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'suite_legacy_saved' and policyname = 'suite_legacy_saved_admin') then
    create policy suite_legacy_saved_admin on public.suite_legacy_saved for all using (public.is_agency_admin()) with check (public.is_agency_admin());
  end if;
end $$;

create index if not exists customer_events_member_type_time on public.customer_events (membership_id, type, occurred_at desc);
