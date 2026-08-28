-- =====================================================================
-- Atlas · CP-110 — production-readiness security hardening
-- =====================================================================
-- Full-system audit (CP-110) findings. Every statement here is
-- NON-DESTRUCTIVE: policy swaps, EXECUTE revokes, and guarded
-- `create or replace` of existing functions. No table/column is
-- dropped; no row is mutated. Safe to run on production and safe to
-- re-run (idempotent).
--
-- Apply this BEFORE deploying the CP-110 app changes. Order within the
-- file does not matter (no cross-dependencies), but the file as a whole
-- should be applied as one transaction.
--
-- Prior migrations assumed applied: cp01 (RLS), cp03, cp17, cp30, cp32,
-- cp37.8, cp42, cp50. Latest-definition-wins; these re-create the final
-- definitions with the missing authorization guard added.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- F1 (CRITICAL) — privilege escalation via self-bootstrap
-- ---------------------------------------------------------------------
-- `bootstrap_self_agency_admin(p_force=>true)` is SECURITY DEFINER and
-- was GRANTed to `authenticated`. Any signed-in user (any customer)
-- could call it and insert themselves an agency_admin row — full
-- platform-owner takeover. It was a one-time dev bootstrap ("safe to
-- drop / lock down later"); the agency admin already exists, so
-- revoking EXECUTE closes the hole with no operational loss. A future
-- admin is bootstrapped via SQL, not this RPC.
revoke execute on function public.bootstrap_self_agency_admin(boolean)
  from public, anon, authenticated;
-- whoami() only returns the caller's own identity/roles — harmless, left as-is.

-- ---------------------------------------------------------------------
-- F2 (CRITICAL) — customers can rewrite their own points / tier / paid status
-- ---------------------------------------------------------------------
-- cp01 created `mem_self` as `FOR ALL` (using + with check user_id =
-- auth.uid()). Under Supabase's default table grants to `authenticated`,
-- a customer can PATCH their own business_memberships row directly via
-- PostgREST and set points_balance, tier, membership_payment_status,
-- membership_expires_at — defeating every SECURITY DEFINER points/
-- membership control. No client code writes this table directly (all
-- writes go through enroll_member / award_points / activate_pending_
-- membership, which are DEFINER and bypass RLS), so read-only-self is
-- the correct policy. Staff updates keep working via mem_staff_write.
drop policy if exists mem_self on public.business_memberships;
create policy mem_self on public.business_memberships
  for select using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- F3 (HIGH) — member PII leak: resolve_member_by_code had no staff gate
-- ---------------------------------------------------------------------
-- SECURITY DEFINER, granted to authenticated, no authorization check.
-- Referral codes are shared publicly by customers to refer friends and
-- business_id is public, so any signed-in user could retrieve any
-- member's full_name/email/phone/points by code. Add the same
-- staffs_business() gate the sibling scan RPCs use. (Same signature &
-- output; only the guard is new.)
create or replace function public.resolve_member_by_code(p_code text, p_business_id uuid)
returns table (
  membership_id uuid, user_id uuid, full_name text, email text, phone text,
  points_balance integer, tier text, joined_at timestamptz, visit_count integer
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.staffs_business(p_business_id) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  return query
    select m.id, m.user_id, p.full_name, p.email, p.phone,
           m.points_balance, m.tier, m.joined_at, m.visit_count
      from public.business_memberships m
      join public.profiles p on p.id = m.user_id
     where m.referral_code = p_code
       and m.business_id = p_business_id
     limit 1;
end; $$;

-- ---------------------------------------------------------------------
-- F4 (MEDIUM) — cross-tenant financial reads (cp17 billing RPCs)
-- ---------------------------------------------------------------------
-- These three SECURITY DEFINER reads were granted to `authenticated`
-- with no authorization check. A customer of one business could read
-- the whole agency's MRR/payments and any business's billing by id.
-- Gate agency-wide reads to agency admins; gate the per-business read
-- to that business's staff/manager (staffs_business also returns true
-- for agency admins/VAs, so they keep access).

create or replace function public.agency_billing_summary()
returns table (
  mrr_cents                    bigint,
  active_subscriptions         int,
  pipeline_cents               bigint,
  pipeline_count               int,
  setup_fees_outstanding_cents bigint,
  setup_fees_collected_30d     bigint,
  payments_30d_cents           bigint,
  payments_30d_count           int
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_agency_admin() then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  return query
  with subs as (
    select status, monthly_cents from public.agency_billing_subscriptions
  )
  select
    coalesce(sum(case when status = 'active' then monthly_cents end), 0)::bigint,
    count(*) filter (where status = 'active')::int,
    coalesce(sum(case when status in ('trialing','paused','past_due') then monthly_cents end), 0)::bigint,
    count(*) filter (where status in ('trialing','paused','past_due'))::int,
    (select coalesce(sum(amount_cents), 0)::bigint
        from public.agency_billing_setup_fees
       where status in ('pending','invoiced')),
    (select coalesce(sum(amount_cents), 0)::bigint
        from public.agency_billing_setup_fees
       where status = 'paid' and paid_at >= now() - interval '30 days'),
    (select coalesce(sum(amount_cents), 0)::bigint
        from public.agency_billing_payments
       where status = 'paid' and paid_at >= now() - interval '30 days'),
    (select count(*)::int
        from public.agency_billing_payments
       where status = 'paid' and paid_at >= now() - interval '30 days')
   from subs;
end; $$;

create or replace function public.list_agency_payments(p_limit int default 20)
returns table (
  id uuid, business_id uuid, business_name text,
  amount_cents int, type text, status text,
  description text, paid_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_agency_admin() then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  return query
  select p.id, p.business_id, b.name, p.amount_cents, p.type, p.status,
         p.description, p.paid_at
    from public.agency_billing_payments p
    join public.businesses b on b.id = p.business_id
   order by p.paid_at desc nulls last
   limit greatest(1, least(p_limit, 100));
end; $$;

create or replace function public.my_business_billing(p_business_id uuid)
returns table (
  plan_name text, monthly_cents int, status text,
  current_period_end timestamptz, started_at timestamptz,
  setup_fees_outstanding_cents bigint,
  recent_payments jsonb
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.staffs_business(p_business_id) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  return query
  select
    s.plan_name, s.monthly_cents, s.status, s.current_period_end, s.started_at,
    coalesce(
      (select sum(amount_cents) from public.agency_billing_setup_fees
        where business_id = p_business_id and status in ('pending','invoiced')), 0
    )::bigint,
    coalesce(
      (select jsonb_agg(jsonb_build_object(
         'amount_cents', amount_cents, 'type', type, 'status', status,
         'description', description, 'paid_at', paid_at
       ) order by paid_at desc nulls last)
         from (
           select amount_cents, type, status, description, paid_at
             from public.agency_billing_payments
            where business_id = p_business_id
            order by paid_at desc nulls last
            limit 10
         ) sub
      ), '[]'::jsonb
    )
  from public.agency_billing_subscriptions s
  where s.business_id = p_business_id
    and s.status in ('trialing','active','past_due','paused')
  order by s.started_at desc
  limit 1;
end; $$;

-- ---------------------------------------------------------------------
-- F5 (MEDIUM) — cross-tenant analytics reads (atlas_impact_*)
-- ---------------------------------------------------------------------
-- Both return any business's revenue/visit/review analytics by id with
-- no gate. Add staffs_business() (managers of that business + agency
-- staff). Final defs: atlas_impact_rollup = cp50, atlas_impact_monthly
-- = cp32. Bodies reproduced verbatim with the guard prepended.

create or replace function public.atlas_impact_rollup(p_business_id uuid)
returns table (
  driven_revenue_cents           bigint,
  repeat_visit_lift_pct          numeric,
  reviews_generated              bigint,
  reviews_generated_30d          bigint,
  estimated_review_value_cents   bigint,
  estimated_winback_cents        bigint,
  retention_lift_pct             numeric,
  avg_member_value_cents         bigint,
  member_count                   bigint,
  baseline_visits_30d            int,
  actual_visits_30d              int,
  baseline_revenue_30d_cents     bigint,
  actual_revenue_30d_cents       bigint,
  baseline_google_reviews        int,
  baseline_google_rating         numeric,
  baseline_captured_at           timestamptz,
  baseline_monthly_visits        int,
  baseline_monthly_revenue_cents bigint,
  baseline_avg_ticket_cents      bigint
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
  v_per_visit_cents   bigint := 2500;
  v_review_value_cents bigint := 3500;
begin
  if not public.staffs_business(p_business_id) then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  select * into v_b from public.businesses where id = p_business_id;

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
    greatest(0, v_actual_revenue - v_baseline_revenue),
    case when v_baseline_visits > 0
         then round(((v_visits_30d - v_baseline_visits)::numeric / v_baseline_visits) * 100, 0)
         else 0 end,
    v_reviews_total,
    v_reviews_30d,
    (v_reviews_30d * v_review_value_cents)::bigint,
    0::bigint,
    case when v_baseline_visits > 0
         then round(((v_visits_30d - v_baseline_visits)::numeric / v_baseline_visits) * 100, 0)
         else 0 end,
    case when v_member_count > 0 then (v_actual_revenue / v_member_count)::bigint else 0 end,
    v_member_count,
    v_baseline_visits::int,
    v_visits_30d::int,
    v_baseline_revenue,
    v_actual_revenue,
    v_b.baseline_google_review_count,
    v_b.baseline_google_rating,
    v_b.baseline_captured_at,
    v_b.baseline_monthly_visits,
    v_b.baseline_monthly_revenue_cents,
    v_b.baseline_avg_ticket_cents;
end; $$;

create or replace function public.atlas_impact_monthly(p_business_id uuid)
returns table (month text, reviews bigint, revenue_cents bigint, visits bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.staffs_business(p_business_id) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  return query
  with months as (
    select date_trunc('month', d)::date as m
      from generate_series(date_trunc('month', now()) - interval '5 months',
                           date_trunc('month', now()),
                           interval '1 month') as d
  ),
  rev as (
    select date_trunc('month', l.created_at)::date as m,
           count(*) filter (where l.delta > 0) as visits,
           (count(*) filter (where l.delta > 0) * 2500)::bigint as revenue
      from public.points_ledger l
      join public.business_memberships bm on bm.id = l.membership_id
     where bm.business_id = p_business_id
     group by 1
  ),
  rev_count as (
    select date_trunc('month', coalesce(r.verified_at, r.submitted_at))::date as m,
           count(*) as reviews
      from public.reviews r
     where r.business_id = p_business_id
       and r.status = 'verified'
     group by 1
  )
  select to_char(months.m, 'Mon'),
         coalesce(rev_count.reviews, 0)::bigint,
         coalesce(rev.revenue, 0)::bigint,
         coalesce(rev.visits, 0)::bigint
    from months
    left join rev       on rev.m       = months.m
    left join rev_count on rev_count.m = months.m
   order by months.m;
end; $$;

-- ---------------------------------------------------------------------
-- F6 (DATA-INTEGRITY) — reverse_last_award clobbers concurrent balance
-- ---------------------------------------------------------------------
-- The undo read the ORIGINAL award's stale balance_after and wrote
-- points_balance = balance_after - delta absolutely, discarding any
-- award/redeem that happened in the 60s window (two front-desk
-- stations). Fix: lock the membership row, refuse a second reversal of
-- the same entry, and adjust the balance RELATIVELY. Same signature &
-- return; only the concurrency handling changed.
create or replace function public.reverse_last_award(
  p_business_id   uuid,
  p_membership_id uuid,
  p_within_seconds integer default 60
)
returns table (
  reversed_ledger_id uuid,
  delta              integer
)
language plpgsql security definer set search_path = public as $$
declare
  v_row     record;
  v_new_id  uuid;
  v_cur_bal integer;
  v_new_bal integer;
begin
  if not public.staffs_business(p_business_id) then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  -- Lock the membership so a concurrent award/redeem/undo serializes.
  select points_balance into v_cur_bal
    from public.business_memberships
   where id = p_membership_id
   for update;
  if v_cur_bal is null then
    raise exception 'membership not found';
  end if;

  select pl.id, pl.delta
    into v_row
    from public.points_ledger pl
   where pl.business_id   = p_business_id
     and pl.membership_id = p_membership_id
     and pl.delta > 0
     and pl.rule_type <> 'reversal'
     and pl.created_at > now() - make_interval(secs => p_within_seconds)
   order by pl.created_at desc
   limit 1;

  if v_row is null then
    raise exception 'no recent positive ledger entry to reverse';
  end if;

  -- Idempotency: if this entry was already reversed, no-op cleanly.
  if exists (
    select 1 from public.points_ledger
     where idempotency_key = 'rev-' || v_row.id::text
  ) then
    raise exception 'that award was already undone';
  end if;

  -- Adjust RELATIVELY from the current (locked) balance, never below 0.
  v_new_bal := greatest(0, v_cur_bal - v_row.delta);

  insert into public.points_ledger
    (membership_id, business_id, delta, rule_type, reference_id,
     idempotency_key, balance_after)
  values
    (p_membership_id, p_business_id, -v_row.delta, 'reversal', v_row.id,
     'rev-' || v_row.id::text, v_new_bal);
  v_new_id := (select id from public.points_ledger
                where idempotency_key = 'rev-' || v_row.id::text);

  update public.business_memberships
     set points_balance = v_new_bal
   where id = p_membership_id;

  return query select v_new_id, -v_row.delta;
end; $$;

commit;

-- =====================================================================
-- Post-apply verification (read-only; run manually if desired):
--   select polcmd from pg_policies
--    where tablename='business_memberships' and policyname='mem_self';   -- expect 'r' (SELECT)
--   select has_function_privilege('authenticated',
--     'public.bootstrap_self_agency_admin(boolean)','execute');          -- expect false
-- =====================================================================
