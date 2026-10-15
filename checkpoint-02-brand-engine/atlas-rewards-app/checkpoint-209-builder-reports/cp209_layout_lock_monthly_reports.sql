-- CP-209 · layout lock + monthly reports.
-- APPLIED to production Oct 14 2026 via the Supabase MCP
-- (migration cp209_layout_lock_monthly_reports). Safe to re-run.

-- (1) Layout lock: a set layout_preset can never change. The update is
-- silently pinned back (no error, so editor Saves that echo the field never
-- fail). NULL → value is allowed (new-business modal sets it after insert).
-- Real correction in SQL:  set local atlas.allow_layout_change = 'on';
create or replace function public.pin_layout_preset()
returns trigger language plpgsql as $$
begin
  if old.layout_preset is not null
     and new.layout_preset is distinct from old.layout_preset
     and coalesce(current_setting('atlas.allow_layout_change', true), '') <> 'on' then
    new.layout_preset := old.layout_preset;
  end if;
  return new;
end;
$$;

create or replace trigger trg_pin_layout_preset
  before update on public.businesses
  for each row execute function public.pin_layout_preset();

-- (2) Archive of each month's report (written by the cron, read by managers).
create table if not exists public.business_monthly_reports (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  month date not null,
  data jsonb not null,
  generated_at timestamptz not null default now(),
  emailed_at timestamptz,
  emailed_to text[],
  unique (business_id, month)
);
create index if not exists business_monthly_reports_biz_month on public.business_monthly_reports (business_id, month desc);
alter table public.business_monthly_reports enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='business_monthly_reports' and policyname='bmr_manager_read') then
    create policy bmr_manager_read on public.business_monthly_reports
      for select using (public.current_app_role(business_id) in ('agency_admin','business_manager'));
  end if;
end $$;

-- (3) Report functions. _report_core / _build_monthly_report / _report_recipients
-- are service-role only; business_monthly_report is the manager-facing wrapper.
-- Full bodies: see the migration in Supabase (Database → Migrations →
-- cp209_layout_lock_monthly_reports), or run:
--   select pg_get_functiondef('public._build_monthly_report(uuid,date)'::regprocedure);
-- Metrics per window: new_members, total_members, visits (distinct member-days
-- from visit/purchase/first-visit points + med spa treatments), active_members,
-- returning_members, points_earned/redeemed, rewards_redeemed, reviews (not
-- rejected), referrals, membership_revenue_cents, paid_members, treatments,
-- shop_sales_cents, shop_orders, inactive_60d. Month-to-date compares against
-- the same number of days of the previous month.

revoke all on function public._report_core(uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public._build_monthly_report(uuid, date) from public, anon, authenticated;
revoke all on function public._report_recipients(uuid) from public, anon, authenticated;
grant execute on function public._report_core(uuid, timestamptz, timestamptz) to service_role;
grant execute on function public._build_monthly_report(uuid, date) to service_role;
grant execute on function public._report_recipients(uuid) to service_role;
grant execute on function public.business_monthly_report(uuid, date) to authenticated;

-- CP-209b (APPLIED Oct 14 2026, migration cp209b_report_logo): _build_monthly_report's
-- `business` object now also carries logo_url and icon_url (app_icon_url) so the
-- email header and dashboard band show the business's own logo.
