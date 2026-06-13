-- =====================================================================
-- CP-50 — Agency command center: prospect pipeline, revenue charts,
--          editable + richer business baseline
-- =====================================================================
-- Apply AFTER cp49_migration.sql. Idempotent — safe to re-run.
--
-- PART A — Prospect pipeline (CRM)
--   New agency_pipeline table: leads that aren't Atlas businesses yet,
--   moved through stages (lead → contacted → in_talks → proposal →
--   won/lost). Agency-admin only. Feeds the new Pipeline page + the
--   funnel chart on the dashboard.
--
-- PART B — Agency revenue chart RPCs
--   agency_revenue_timeseries  — month-by-month MRR + setup + collected
--   agency_mrr_by_business     — what each sub-account pays us / month
--   agency_pipeline_summary    — counts + $ value per pipeline stage
--   All gated to agency_admin (the underlying tables are agency-wide).
--
-- PART C — Business baseline
--   Adds baseline_avg_ticket_cents (avg spend per visit) so the Insights
--   "with vs without Atlas" revenue comparison uses a REAL per-visit
--   value instead of a flat $25 proxy. save_business_baseline + the
--   atlas_impact_rollup are updated to read/use it. Baseline stays fully
--   editable from the business Settings tab.
-- =====================================================================

create extension if not exists pgcrypto with schema public;


-- =====================================================================
-- PART A — PROSPECT PIPELINE
-- =====================================================================
create table if not exists public.agency_pipeline (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  contact_name          text,
  contact_info          text,                 -- freeform phone / email / @handle
  stage                 text not null default 'lead'
                          check (stage in ('lead','contacted','in_talks','proposal','won','lost')),
  est_monthly_cents     int  not null default 0,
  notes                 text,
  sort                  int  not null default 0,
  converted_business_id uuid references public.businesses(id) on delete set null,
  created_by            uuid default auth.uid(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists agency_pipeline_stage_idx on public.agency_pipeline(stage, sort);

alter table public.agency_pipeline enable row level security;
do $$ begin
  begin drop policy "pipeline_agency_all" on public.agency_pipeline; exception when undefined_object then null; end;
end $$;
create policy "pipeline_agency_all" on public.agency_pipeline
  for all to authenticated
  using (public.is_agency_admin())
  with check (public.is_agency_admin());

drop trigger if exists trg_agency_pipeline_updated on public.agency_pipeline;
create trigger trg_agency_pipeline_updated before update on public.agency_pipeline
  for each row execute function public.set_updated_at();

-- Per-stage rollup for the funnel chart.
create or replace function public.agency_pipeline_summary()
returns table (stage text, lead_count bigint, value_cents bigint)
language sql stable security definer set search_path = public as $$
  select p.stage, count(*)::bigint, coalesce(sum(p.est_monthly_cents),0)::bigint
    from public.agency_pipeline p
   where public.is_agency_admin()
   group by p.stage;
$$;
grant execute on function public.agency_pipeline_summary() to authenticated;


-- =====================================================================
-- PART B — AGENCY REVENUE CHART RPCs
-- =====================================================================

-- Month-by-month: recognized MRR (snapshot at month-end), setup fees
-- booked that month, and cash actually collected that month.
create or replace function public.agency_revenue_timeseries(p_months int default 6)
returns table (
  month_start      date,
  mrr_cents        bigint,
  setup_cents      bigint,
  collected_cents  bigint
)
language sql stable security definer set search_path = public as $$
  with months as (
    select (date_trunc('month', now())::date
            - (interval '1 month' * g))::date as month_start
      from generate_series(0, greatest(0, p_months - 1)) g
  ),
  mlist as (
    select month_start,
           (month_start + interval '1 month' - interval '1 second') as month_end,
           (month_start + interval '1 month')                       as next_start
      from months
  )
  select
    ml.month_start,
    -- MRR recognized in this month: paying subs that had started by
    -- month-end and weren't yet canceled at month-start.
    coalesce((
      select sum(s.monthly_cents)::bigint
        from public.agency_billing_subscriptions s
       where s.status in ('active','past_due')
         and s.started_at <= ml.month_end
         and (s.canceled_at is null or s.canceled_at >= ml.month_start)
    ), 0) as mrr_cents,
    -- Setup fees booked this month.
    coalesce((
      select sum(f.amount_cents)::bigint
        from public.agency_billing_setup_fees f
       where f.created_at >= ml.month_start and f.created_at < ml.next_start
    ), 0) as setup_cents,
    -- Cash collected this month (Stripe payments + setup fees marked paid).
    coalesce((
      select sum(p.amount_cents)::bigint
        from public.agency_billing_payments p
       where p.status = 'paid'
         and p.paid_at >= ml.month_start and p.paid_at < ml.next_start
    ), 0)
    + coalesce((
      select sum(f.amount_cents)::bigint
        from public.agency_billing_setup_fees f
       where f.status = 'paid'
         and f.paid_at >= ml.month_start and f.paid_at < ml.next_start
    ), 0) as collected_cents
  from mlist ml
  where public.is_agency_admin()
  order by ml.month_start;
$$;
grant execute on function public.agency_revenue_timeseries(int) to authenticated;

-- What each sub-account pays us per month (for the ranking bar chart).
create or replace function public.agency_mrr_by_business()
returns table (
  business_id   uuid,
  business_name text,
  monthly_cents int,
  status        text
)
language sql stable security definer set search_path = public as $$
  select s.business_id, b.name, s.monthly_cents, s.status
    from public.agency_billing_subscriptions s
    join public.businesses b on b.id = s.business_id
   where public.is_agency_admin()
     and s.status in ('active','past_due','trialing','paused')
   order by (s.status = 'active') desc, s.monthly_cents desc;
$$;
grant execute on function public.agency_mrr_by_business() to authenticated;


-- =====================================================================
-- PART C — BUSINESS BASELINE (avg ticket + editable)
-- =====================================================================
alter table public.businesses
  add column if not exists baseline_avg_ticket_cents bigint;

-- save_business_baseline gains p_avg_ticket_cents. Return-type is void
-- but the SIGNATURE changes (extra arg), so drop the old one first.
drop function if exists public.save_business_baseline(uuid, int, numeric, bigint, int);

create function public.save_business_baseline(
  p_business_id            uuid,
  p_google_review_count    int,
  p_google_rating          numeric,
  p_monthly_revenue_cents  bigint,
  p_monthly_visits         int,
  p_avg_ticket_cents       bigint default null
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_agency_admin() then
    raise exception 'only agency_admin can update business baseline';
  end if;

  update public.businesses
     set baseline_google_review_count   = p_google_review_count,
         baseline_google_rating         = p_google_rating,
         baseline_monthly_revenue_cents = p_monthly_revenue_cents,
         baseline_monthly_visits        = p_monthly_visits,
         baseline_avg_ticket_cents      = p_avg_ticket_cents,
         baseline_captured_at           = now()
   where id = p_business_id;
end; $$;
grant execute on function public.save_business_baseline(uuid, int, numeric, bigint, int, bigint) to authenticated;

-- atlas_impact_rollup v3 — use the operator's avg-ticket as the per-visit
-- value when present (so editing the baseline visibly moves the Insights
-- numbers on both the manager and agency views). Appends three baseline
-- columns; keeps every existing column so current consumers are unaffected.
drop function if exists public.atlas_impact_rollup(uuid);

create function public.atlas_impact_rollup(p_business_id uuid)
returns table (
  driven_revenue_cents          bigint,
  repeat_visit_lift_pct         numeric,
  reviews_generated             bigint,
  reviews_generated_30d         bigint,
  estimated_review_value_cents  bigint,
  estimated_winback_cents       bigint,
  retention_lift_pct            numeric,
  avg_member_value_cents        bigint,
  member_count                  bigint,
  baseline_visits_30d           int,
  actual_visits_30d             int,
  baseline_revenue_30d_cents    bigint,
  actual_revenue_30d_cents      bigint,
  baseline_google_reviews       int,
  baseline_google_rating        numeric,
  baseline_captured_at          timestamptz,
  -- CP-50 additions:
  baseline_monthly_visits       int,
  baseline_monthly_revenue_cents bigint,
  baseline_avg_ticket_cents     bigint
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_b                 record;
  v_member_count      bigint;
  v_visits_30d        bigint;
  v_reviews_30d       bigint;
  v_reviews_total     bigint;
  v_baseline_visits   int;
  v_baseline_revenue  bigint;
  v_actual_revenue    bigint;
  v_per_visit_cents   bigint := 2500;   -- $25 flat proxy (fallback)
  v_review_value_cents bigint := 3500;  -- $35 per review proxy
begin
  select * into v_b from public.businesses where id = p_business_id;

  -- CP-50: if the operator captured an average ticket, use it as the
  -- real per-visit value — this is what makes the revenue comparison
  -- reflect the baseline edits.
  if coalesce(v_b.baseline_avg_ticket_cents, 0) > 0 then
    v_per_visit_cents := v_b.baseline_avg_ticket_cents;
  end if;

  select count(*) into v_member_count
    from public.business_memberships where business_id = p_business_id;

  select count(*) into v_visits_30d
    from public.points_ledger
   where business_id = p_business_id
     and delta > 0
     and created_at > now() - interval '30 days';

  select count(*) into v_reviews_30d
    from public.reviews r
    join public.business_memberships m on m.id = r.membership_id
   where m.business_id = p_business_id
     and r.status = 'verified'
     and r.created_at > now() - interval '30 days';

  select count(*) into v_reviews_total
    from public.reviews r
    join public.business_memberships m on m.id = r.membership_id
   where m.business_id = p_business_id
     and r.status = 'verified';

  v_baseline_visits := coalesce(v_b.baseline_monthly_visits,
                                greatest(0, (v_visits_30d * 0.1)::int));
  v_actual_revenue  := (v_visits_30d * v_per_visit_cents)::bigint;
  v_baseline_revenue := coalesce(v_b.baseline_monthly_revenue_cents,
                                 (v_baseline_visits * v_per_visit_cents)::bigint);

  return query select
    greatest(0, v_actual_revenue - v_baseline_revenue)              as driven_revenue_cents,
    case when v_baseline_visits > 0
         then round(((v_visits_30d - v_baseline_visits)::numeric / v_baseline_visits) * 100, 0)
         else 0 end                                                 as repeat_visit_lift_pct,
    v_reviews_total                                                 as reviews_generated,
    v_reviews_30d                                                   as reviews_generated_30d,
    (v_reviews_30d * v_review_value_cents)::bigint                  as estimated_review_value_cents,
    0::bigint                                                       as estimated_winback_cents,
    case when v_baseline_visits > 0
         then round(((v_visits_30d - v_baseline_visits)::numeric / v_baseline_visits) * 100, 0)
         else 0 end                                                 as retention_lift_pct,
    case when v_member_count > 0 then (v_actual_revenue / v_member_count)::bigint else 0 end
                                                                    as avg_member_value_cents,
    v_member_count                                                  as member_count,
    v_baseline_visits::int                                          as baseline_visits_30d,
    v_visits_30d::int                                               as actual_visits_30d,
    v_baseline_revenue                                              as baseline_revenue_30d_cents,
    v_actual_revenue                                                as actual_revenue_30d_cents,
    v_b.baseline_google_review_count                               as baseline_google_reviews,
    v_b.baseline_google_rating                                     as baseline_google_rating,
    v_b.baseline_captured_at                                       as baseline_captured_at,
    v_b.baseline_monthly_visits                                    as baseline_monthly_visits,
    v_b.baseline_monthly_revenue_cents                            as baseline_monthly_revenue_cents,
    v_b.baseline_avg_ticket_cents                                 as baseline_avg_ticket_cents;
end; $$;
grant execute on function public.atlas_impact_rollup(uuid) to authenticated;

notify pgrst, 'reload schema';
