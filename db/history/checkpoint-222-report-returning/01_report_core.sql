-- CP-222: monthly report "returning members" = visited on 2+ different days
-- (any time up to the end of the window), not only "visited before the month
-- began". Visits also count desk check-ins, one per member per local day.
CREATE OR REPLACE FUNCTION public._report_core(p_business_id uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  with tz as (select coalesce(public.business_timezone(p_business_id), 'America/Los_Angeles') as z),
  earn as (
    select membership_id, created_at, delta, rule_type
    from points_ledger
    where business_id = p_business_id and created_at >= p_from and created_at < p_to
  ),
  all_visits as (
    select pl.membership_id, pl.created_at as at_
      from points_ledger pl
     where pl.business_id = p_business_id and pl.created_at < p_to
       and pl.rule_type in ('visit', 'purchase', 'first_visit_bonus') and pl.delta > 0
    union all
    select ce.membership_id, ce.created_at
      from check_in_events ce join business_memberships m on m.id = ce.membership_id
     where m.business_id = p_business_id and ce.created_at < p_to
    union all
    select m.id, l.performed_at
      from medspa_treatment_log l
      join business_memberships m on m.business_id = l.business_id and m.user_id = l.user_id
     where l.business_id = p_business_id and l.performed_at < p_to
  ),
  visit_days as (
    select membership_id, (at_ at time zone (select z from tz))::date as d, min(at_) as first_at
      from all_visits group by 1, 2
  ),
  visit_rows as (select membership_id, d from visit_days where first_at >= p_from),
  visitors as (select distinct membership_id from visit_rows),
  returning_v as (
    select v.membership_id from visitors v
     where (select count(*) from visit_days x where x.membership_id = v.membership_id) >= 2
  )
  select jsonb_build_object(
    'new_members',      (select count(*) from business_memberships where business_id = p_business_id and created_at >= p_from and created_at < p_to),
    'total_members',    (select count(*) from business_memberships where business_id = p_business_id and created_at < p_to),
    'visits',           (select count(*) from visit_rows),
    'active_members',   (select count(*) from visitors),
    'returning_members',(select count(*) from returning_v),
    'points_earned',    coalesce((select sum(delta) from earn where delta > 0 and rule_type not in ('reversal')), 0),
    'points_redeemed',  coalesce((select -sum(delta) from earn where rule_type = 'redemption'), 0),
    'rewards_redeemed', (select count(*) from redemptions where business_id = p_business_id and created_at >= p_from and created_at < p_to),
    'reviews',          (select count(*) from reviews where business_id = p_business_id and submitted_at >= p_from and submitted_at < p_to and status <> 'rejected'),
    'referrals',        (select count(*) from referrals where business_id = p_business_id and coalesce(signed_up_at, created_at) >= p_from and coalesce(signed_up_at, created_at) < p_to),
    'membership_revenue_cents', coalesce((select sum(amount_cents) from membership_payments
                          where business_id = p_business_id and coalesce(paid_at, created_at) >= p_from and coalesce(paid_at, created_at) < p_to
                            and coalesce(status, 'paid') in ('paid', 'succeeded', 'complete', 'completed')), 0),
    'paid_members',     (select count(*) from business_memberships where business_id = p_business_id and membership_payment_status = 'paid'),
    'treatments',       (select count(*) from medspa_treatment_log where business_id = p_business_id and performed_at >= p_from and performed_at < p_to),
    'shop_sales_cents', coalesce((select sum(amount_cents) from medspa_shop_orders
                          where business_id = p_business_id and status in ('paid', 'fulfilled')
                            and coalesce(paid_at, created_at) >= p_from and coalesce(paid_at, created_at) < p_to), 0),
    'shop_orders',      (select count(*) from medspa_shop_orders
                          where business_id = p_business_id and status in ('paid', 'fulfilled')
                            and coalesce(paid_at, created_at) >= p_from and coalesce(paid_at, created_at) < p_to),
    'inactive_60d',     (select count(*) from business_memberships
                          where business_id = p_business_id and created_at < p_to - interval '60 days'
                            and coalesce(last_visit_at, created_at) < p_to - interval '60 days')
  );
$function$;
