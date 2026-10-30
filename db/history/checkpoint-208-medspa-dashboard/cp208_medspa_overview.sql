-- CP-208 · med spa manager Overview RPC. APPLIED to production Oct 14 2026
-- via the Supabase MCP (migration cp208_medspa_overview). Safe to re-run.
-- Managers/agency only; staff get a 42501.
create or replace function public.medspa_overview(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v jsonb;
begin
  if public.current_app_role(p_business_id) not in ('agency_admin','business_manager') then
    raise exception 'not authorized for business %', p_business_id using errcode = '42501';
  end if;

  with months as (
    select generate_series(
      date_trunc('month', now()) - interval '11 months',
      date_trunc('month', now()),
      interval '1 month') as mo
  ),
  visits_m as (
    select date_trunc('month', performed_at) as mo, count(*)::int as c
    from medspa_treatment_log
    where business_id = p_business_id and performed_at > now() - interval '12 months'
    group by 1
  ),
  sales_m as (
    select date_trunc('month', coalesce(paid_at, created_at)) as mo, sum(amount_cents)::bigint as c
    from medspa_shop_orders
    where business_id = p_business_id and status in ('paid','fulfilled')
      and coalesce(paid_at, created_at) > now() - interval '12 months'
    group by 1
  ),
  joins_m as (
    select date_trunc('month', created_at) as mo, count(*)::int as c
    from business_memberships
    where business_id = p_business_id and created_at > now() - interval '12 months'
    group by 1
  ),
  feed as (
    (select m.created_at as at, 'signup'::text as kind,
        coalesce(nullif(btrim(p.full_name),''), nullif(btrim(au.raw_user_meta_data->>'full_name'),''),
                 nullif(btrim(p.email),''), nullif(btrim(au.email),''), 'Guest') as who,
        null::text as detail, null::bigint as amount_cents
      from business_memberships m
      left join profiles p on p.id = m.user_id
      left join auth.users au on au.id = m.user_id
      where m.business_id = p_business_id
      order by m.created_at desc limit 20)
    union all
    (select l.performed_at, 'treatment'::text,
        coalesce(nullif(btrim(p.full_name),''), nullif(btrim(au.raw_user_meta_data->>'full_name'),''),
                 nullif(btrim(p.email),''), nullif(btrim(au.email),''), 'Guest'),
        l.treatment_name, null::bigint
      from medspa_treatment_log l
      left join profiles p on p.id = l.user_id
      left join auth.users au on au.id = l.user_id
      where l.business_id = p_business_id
      order by l.performed_at desc limit 20)
    union all
    (select coalesce(o.paid_at, o.created_at), 'order'::text,
        coalesce(nullif(btrim(p.full_name),''), nullif(btrim(au.raw_user_meta_data->>'full_name'),''),
                 nullif(btrim(p.email),''), nullif(btrim(au.email),''), 'Guest'),
        o.item_name, o.amount_cents::bigint
      from medspa_shop_orders o
      left join profiles p on p.id = o.user_id
      left join auth.users au on au.id = o.user_id
      where o.business_id = p_business_id and o.status in ('paid','fulfilled')
      order by coalesce(o.paid_at, o.created_at) desc limit 20)
  )
  select jsonb_build_object(
    'patients',          (select count(*) from business_memberships where business_id = p_business_id),
    'members_paid',      (select count(*) from business_memberships where business_id = p_business_id and membership_payment_status = 'paid'),
    'visits_total',      (select count(*) from medspa_treatment_log where business_id = p_business_id),
    'visits_30d',        (select count(*) from medspa_treatment_log where business_id = p_business_id and performed_at > now() - interval '30 days'),
    'sales_cents_total', coalesce((select sum(amount_cents) from medspa_shop_orders where business_id = p_business_id and status in ('paid','fulfilled')), 0),
    'sales_cents_30d',   coalesce((select sum(amount_cents) from medspa_shop_orders where business_id = p_business_id and status in ('paid','fulfilled') and coalesce(paid_at, created_at) > now() - interval '30 days'), 0),
    'auto_offers_active',(select count(*) from business_automated_offers where business_id = p_business_id and is_active),
    'monthly', (
      select jsonb_agg(jsonb_build_object(
        'month', to_char(months.mo, 'YYYY-MM'),
        'visits', coalesce(vm.c, 0),
        'sales_cents', coalesce(sm.c, 0),
        'joins', coalesce(jm.c, 0)) order by months.mo)
      from months
      left join visits_m vm on vm.mo = months.mo
      left join sales_m  sm on sm.mo = months.mo
      left join joins_m  jm on jm.mo = months.mo
    ),
    'activity', coalesce((
      select jsonb_agg(jsonb_build_object(
        'at', f.at, 'kind', f.kind, 'who', f.who, 'detail', f.detail, 'amount_cents', f.amount_cents) order by f.at desc)
      from (select * from feed order by at desc limit 30) f
    ), '[]'::jsonb)
  ) into v;

  return v;
end;
$$;
