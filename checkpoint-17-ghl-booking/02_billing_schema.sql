-- =====================================================================
-- CHECKPOINT 17 (part 2) — Stripe billing + agency MRR rollups
-- =====================================================================
-- Atlas charges sub-account businesses a monthly subscription + one-time
-- setup fee. This file lays down the storage for those records, plus the
-- rollups the agency dashboard uses to render MRR / pipeline / payments.
--
-- Stripe is the processor — the *Atlas → business* relationship lives in
-- our DB; Stripe just collects money. Webhooks update local rows.
-- =====================================================================

-- ----- 1. Per-business subscriptions -----
create table if not exists public.agency_billing_subscriptions (
  id                       uuid primary key default uuid_generate_v4(),
  business_id              uuid not null references public.businesses(id) on delete cascade,
  stripe_customer_id       text,
  stripe_subscription_id   text unique,
  plan_name                text not null default 'Standard',
  monthly_cents            int  not null default 0,
  status                   text not null default 'trialing'
                           check (status in ('trialing','active','past_due','paused','canceled')),
  current_period_end       timestamptz,
  started_at               timestamptz not null default now(),
  canceled_at              timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index if not exists agency_billing_subs_biz_idx on public.agency_billing_subscriptions(business_id);
create unique index if not exists agency_billing_subs_biz_one_active
  on public.agency_billing_subscriptions(business_id)
  where status in ('trialing','active','past_due');

drop trigger if exists trg_agency_subs_updated on public.agency_billing_subscriptions;
create trigger trg_agency_subs_updated before update on public.agency_billing_subscriptions
  for each row execute function public.set_updated_at();

-- ----- 2. Setup fees (one-time onboarding charges) -----
create table if not exists public.agency_billing_setup_fees (
  id                  uuid primary key default uuid_generate_v4(),
  business_id         uuid not null references public.businesses(id) on delete cascade,
  description         text not null default 'Onboarding & build fee',
  amount_cents        int  not null check (amount_cents >= 0),
  status              text not null default 'pending'
                      check (status in ('pending','invoiced','paid','waived','refunded')),
  stripe_invoice_id   text,
  invoiced_at         timestamptz,
  paid_at             timestamptz,
  created_at          timestamptz not null default now()
);
create index if not exists agency_billing_setup_biz_idx on public.agency_billing_setup_fees(business_id, status);

-- ----- 3. Payment history (raw ledger from Stripe webhooks) -----
create table if not exists public.agency_billing_payments (
  id                  uuid primary key default uuid_generate_v4(),
  business_id         uuid not null references public.businesses(id) on delete cascade,
  stripe_invoice_id   text unique,
  stripe_charge_id    text,
  amount_cents        int  not null,
  -- "subscription" = recurring monthly, "setup" = one-time onboarding,
  -- "onetime" = ad-hoc invoice
  type                text not null check (type in ('subscription','setup','onetime')),
  status              text not null check (status in ('paid','failed','refunded')),
  description         text,
  paid_at             timestamptz,
  created_at          timestamptz not null default now()
);
create index if not exists agency_payments_biz_idx on public.agency_billing_payments(business_id, paid_at desc);

-- ----- 4. Agency-wide settings (single row) -----
create table if not exists public.agency_settings (
  id                   int primary key default 1 check (id = 1),
  stripe_account_id    text,
  default_setup_fee_cents int not null default 50000,  -- $500 default
  default_monthly_cents   int not null default 19900,  -- $199 default
  support_email        text,
  support_url          text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
-- Seed the singleton.
insert into public.agency_settings (id) values (1) on conflict do nothing;

drop trigger if exists trg_agency_settings_updated on public.agency_settings;
create trigger trg_agency_settings_updated before update on public.agency_settings
  for each row execute function public.set_updated_at();

-- ----- 5. RLS — only agency admins can read/write billing data -----
alter table public.agency_billing_subscriptions enable row level security;
alter table public.agency_billing_setup_fees    enable row level security;
alter table public.agency_billing_payments      enable row level security;
alter table public.agency_settings              enable row level security;

do $$ begin
  begin drop policy "ab_subs_agency"   on public.agency_billing_subscriptions; exception when undefined_object then null; end;
  begin drop policy "ab_setup_agency"  on public.agency_billing_setup_fees;    exception when undefined_object then null; end;
  begin drop policy "ab_pay_agency"    on public.agency_billing_payments;      exception when undefined_object then null; end;
  begin drop policy "ab_settings_read" on public.agency_settings;              exception when undefined_object then null; end;
  begin drop policy "ab_settings_write" on public.agency_settings;             exception when undefined_object then null; end;
  begin drop policy "ab_subs_manager"  on public.agency_billing_subscriptions; exception when undefined_object then null; end;
  begin drop policy "ab_pay_manager"   on public.agency_billing_payments;      exception when undefined_object then null; end;
end $$;

-- Agency admins manage everything
create policy "ab_subs_agency" on public.agency_billing_subscriptions for all to authenticated
  using (exists (select 1 from public.business_users where user_id = auth.uid() and role = 'agency_admin'))
  with check (exists (select 1 from public.business_users where user_id = auth.uid() and role = 'agency_admin'));

create policy "ab_setup_agency" on public.agency_billing_setup_fees for all to authenticated
  using (exists (select 1 from public.business_users where user_id = auth.uid() and role = 'agency_admin'))
  with check (exists (select 1 from public.business_users where user_id = auth.uid() and role = 'agency_admin'));

create policy "ab_pay_agency" on public.agency_billing_payments for all to authenticated
  using (exists (select 1 from public.business_users where user_id = auth.uid() and role = 'agency_admin'))
  with check (exists (select 1 from public.business_users where user_id = auth.uid() and role = 'agency_admin'));

-- Business managers can READ their own subscription + payment history
create policy "ab_subs_manager" on public.agency_billing_subscriptions for select to authenticated
  using (public.staffs_business(business_id));

create policy "ab_pay_manager" on public.agency_billing_payments for select to authenticated
  using (public.staffs_business(business_id));

-- Agency settings — readable by any agency admin, writable too
create policy "ab_settings_read" on public.agency_settings for select to authenticated
  using (exists (select 1 from public.business_users where user_id = auth.uid() and role = 'agency_admin'));

create policy "ab_settings_write" on public.agency_settings for all to authenticated
  using (exists (select 1 from public.business_users where user_id = auth.uid() and role = 'agency_admin'))
  with check (exists (select 1 from public.business_users where user_id = auth.uid() and role = 'agency_admin'));

-- ----- 6. RPC: agency_billing_summary — what the dashboard cards show -----
create or replace function public.agency_billing_summary()
returns table (
  mrr_cents                   bigint,
  active_subscriptions        int,
  pipeline_cents              bigint,    -- trialing or paused subs (the potential)
  pipeline_count              int,
  setup_fees_outstanding_cents bigint,
  setup_fees_collected_30d    bigint,
  payments_30d_cents          bigint,
  payments_30d_count          int
)
language sql stable security definer set search_path = public as $$
  with subs as (
    select status, monthly_cents from public.agency_billing_subscriptions
  )
  select
    coalesce(sum(case when status = 'active' then monthly_cents end), 0)::bigint  as mrr_cents,
    count(*) filter (where status = 'active')::int                                as active_subscriptions,
    coalesce(sum(case when status in ('trialing','paused','past_due') then monthly_cents end), 0)::bigint as pipeline_cents,
    count(*) filter (where status in ('trialing','paused','past_due'))::int       as pipeline_count,
    (select coalesce(sum(amount_cents), 0)::bigint
        from public.agency_billing_setup_fees
       where status in ('pending','invoiced'))                                    as setup_fees_outstanding_cents,
    (select coalesce(sum(amount_cents), 0)::bigint
        from public.agency_billing_setup_fees
       where status = 'paid' and paid_at >= now() - interval '30 days')           as setup_fees_collected_30d,
    (select coalesce(sum(amount_cents), 0)::bigint
        from public.agency_billing_payments
       where status = 'paid' and paid_at >= now() - interval '30 days')           as payments_30d_cents,
    (select count(*)::int
        from public.agency_billing_payments
       where status = 'paid' and paid_at >= now() - interval '30 days')           as payments_30d_count
   from subs;
$$;
grant execute on function public.agency_billing_summary() to authenticated;

-- ----- 7. RPC: list_recent_payments -----
create or replace function public.list_agency_payments(p_limit int default 20)
returns table (
  id uuid, business_id uuid, business_name text,
  amount_cents int, type text, status text,
  description text, paid_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select p.id, p.business_id, b.name, p.amount_cents, p.type, p.status,
         p.description, p.paid_at
    from public.agency_billing_payments p
    join public.businesses b on b.id = p.business_id
   order by p.paid_at desc nulls last
   limit greatest(1, least(p_limit, 100));
$$;
grant execute on function public.list_agency_payments(int) to authenticated;

-- ----- 8. RPC: upsert_business_billing — manage one business's plan -----
create or replace function public.upsert_business_billing(
  p_business_id uuid,
  p_plan_name   text,
  p_monthly_cents int,
  p_status      text default 'trialing',
  p_setup_fee_cents int default null
)
returns void language plpgsql security definer set search_path = public as $$
declare v_existing uuid;
begin
  if not exists (
    select 1 from public.business_users where user_id = auth.uid() and role = 'agency_admin'
  ) then
    raise exception 'agency admins only';
  end if;
  if p_status not in ('trialing','active','past_due','paused','canceled') then
    raise exception 'invalid status';
  end if;

  select id into v_existing from public.agency_billing_subscriptions
   where business_id = p_business_id
     and status in ('trialing','active','past_due','paused');

  if v_existing is null then
    insert into public.agency_billing_subscriptions
      (business_id, plan_name, monthly_cents, status)
    values
      (p_business_id, p_plan_name, p_monthly_cents, p_status);
  else
    update public.agency_billing_subscriptions
       set plan_name = p_plan_name,
           monthly_cents = p_monthly_cents,
           status = p_status,
           updated_at = now()
     where id = v_existing;
  end if;

  if p_setup_fee_cents is not null and p_setup_fee_cents > 0 then
    insert into public.agency_billing_setup_fees
      (business_id, amount_cents, status)
    values
      (p_business_id, p_setup_fee_cents, 'pending')
    on conflict do nothing;
  end if;
end; $$;
grant execute on function public.upsert_business_billing(uuid, text, int, text, int) to authenticated;

-- ----- 9. RPC: my_business_billing — manager-side read of own plan + invoices -----
create or replace function public.my_business_billing(p_business_id uuid)
returns table (
  plan_name text, monthly_cents int, status text,
  current_period_end timestamptz, started_at timestamptz,
  setup_fees_outstanding_cents bigint,
  recent_payments jsonb
)
language sql stable security definer set search_path = public as $$
  select
    s.plan_name, s.monthly_cents, s.status, s.current_period_end, s.started_at,
    coalesce(
      (select sum(amount_cents) from public.agency_billing_setup_fees
        where business_id = p_business_id and status in ('pending','invoiced')), 0
    )::bigint as setup_fees_outstanding_cents,
    coalesce(
      -- Inner subquery handles the LIMIT/ORDER; outer jsonb_agg keeps the order.
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
    ) as recent_payments
  from public.agency_billing_subscriptions s
  where s.business_id = p_business_id
    and s.status in ('trialing','active','past_due','paused')
  order by s.started_at desc
  limit 1;
$$;
grant execute on function public.my_business_billing(uuid) to authenticated;
