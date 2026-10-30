-- CP-185 · applied to the live project on 2026-10-04 (one statement per call; the MCP migration tool hung on batches).
alter table public.businesses add column if not exists medspa_config jsonb not null default '{}'::jsonb;
create table if not exists public.medspa_treatment_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  user_id uuid not null,
  treatment_id text not null,
  treatment_name text not null,
  provider_id text, provider_name text,
  recall_weeks integer,
  performed_at timestamptz not null default now(),
  notes text,
  credit_used_cents integer not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.medspa_treatment_log add constraint medspa_treatment_log_business_fk foreign key (business_id) references public.businesses(id) on delete cascade;
create index if not exists medspa_treatment_log_biz_user_idx on public.medspa_treatment_log (business_id, user_id, performed_at desc);
alter table public.medspa_treatment_log enable row level security;
create policy medspa_log_self_read on public.medspa_treatment_log for select using (user_id = auth.uid() or staffs_business(business_id));
create policy medspa_log_staff_write on public.medspa_treatment_log for all using (staffs_business(business_id)) with check (staffs_business(business_id));
