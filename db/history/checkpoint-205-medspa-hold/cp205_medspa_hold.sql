-- CP-205 · 48-hour area holds + follow-up sequence (safe to re-run; additive only)
-- A hold is created right after an open zip check, before the quiz. role/stage come later.
alter table public.landing_leads alter column role drop not null;
alter table public.landing_leads add column if not exists hold_expires_at timestamptz;
alter table public.landing_leads add column if not exists qualified_at timestamptz;
alter table public.landing_leads add column if not exists followups smallint not null default 0;
alter table public.landing_leads add column if not exists followup_last_at timestamptz;
create index if not exists landing_leads_hold_idx on public.landing_leads (hold_expires_at) where hold_expires_at is not null;
comment on column public.landing_leads.hold_expires_at is 'CP-205: the area is held for this lead until this time (48 h from the zip check; extended when they book).';
comment on column public.landing_leads.followups is 'CP-205: how many unbooked follow-up emails this lead has received (max 3).';
