-- CP-202 · A/B arms on /medspa leads + a funnel-by-arm view. Additive, safe to re-run.
alter table public.landing_leads add column if not exists variant text;
create index if not exists landing_leads_variant_idx on public.landing_leads (variant, created_at desc);

-- One row per arm: how many leads, qualified, booked, confirmed, showed, paid.
-- Read it in the Supabase table editor or SQL editor: select * from landing_funnel_by_variant;
create or replace view public.landing_funnel_by_variant
with (security_invoker = true) as
select
  coalesce(l.variant, 'unknown')                                    as variant,
  count(*)                                                          as leads,
  count(*) filter (where l.qualified)                               as qualified,
  count(d.id)                                                       as booked,
  count(d.confirmed_at)                                             as confirmed,
  count(*) filter (where d.outcome in ('showed','paid'))            as showed,
  count(*) filter (where d.outcome = 'paid')                        as paid,
  round(100.0 * count(d.id) / nullif(count(*) filter (where l.qualified), 0), 1) as book_rate_pct,
  min(l.created_at)                                                 as first_lead,
  max(l.created_at)                                                 as last_lead
from public.landing_leads l
left join public.landing_demo_requests d on d.id = l.demo_request_id
group by 1;
revoke all on public.landing_funnel_by_variant from anon, authenticated;
