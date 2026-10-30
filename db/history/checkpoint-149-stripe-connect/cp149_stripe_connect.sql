-- ============================================================================
-- CP-149 · Stripe Connect foundation — memberships paid through Atlas
-- ----------------------------------------------------------------------------
-- Run in the Supabase SQL editor BEFORE deploying the CP-149 build.
-- Idempotent. Apply after cp147.
--
-- WHAT THIS REPLACES
--   CP-23/34 "stripe" mode stored each business's raw secret key + a
--   per-business webhook secret in business_membership_billing, and the
--   membership row only carried paid_at / expires_at / plan_label. Nothing
--   tracked the Stripe customer, the subscription, renewals or failures.
--
-- WHAT THIS ADDS
--   business_payment_accounts   one row per business per provider. For Stripe
--                               Connect (Standard accounts) it holds ONLY the
--                               acct_… id and capability flags — no secrets.
--   membership_subscriptions    the live subscription / pass per membership:
--                               provider ids, status, period end, cancel flag.
--   membership_payments         ledger of every paid / failed / refunded charge.
--   payment_events              provider event ids → idempotent webhooks.
--   apply_membership_event()    THE state machine. The webhook route verifies
--                               the signature, normalises the Stripe event, and
--                               calls this. Any future provider (Square,
--                               Clover) calls the same function.
--
-- SECURITY
--   All four tables are service-role-write only. Managers may READ their own
--   account row (to show "Connected · charges enabled") and their members'
--   subscriptions; customers may read their own subscription/payments.
--   Nothing here is callable by anon.
-- ============================================================================

-- ── 1. business_payment_accounts ────────────────────────────────────────
create table if not exists public.business_payment_accounts (
  id                 uuid primary key default uuid_generate_v4(),
  business_id        uuid not null references public.businesses(id) on delete cascade,
  provider           text not null check (provider in ('stripe','square','clover')),
  /** Stripe: acct_… (Standard connected account). Square: merchant id. */
  provider_account_id text,
  account_type       text,                       -- stripe: 'standard' | 'express'
  charges_enabled    boolean not null default false,
  payouts_enabled    boolean not null default false,
  details_submitted  boolean not null default false,
  /** Stripe's own list of what is still missing (informational). */
  requirements       jsonb,
  livemode           boolean not null default true,
  connected_at       timestamptz,
  disconnected_at    timestamptz,
  last_synced_at     timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (business_id, provider)
);
create index if not exists bpa_provider_account_idx on public.business_payment_accounts(provider, provider_account_id);
drop trigger if exists trg_bpa_updated on public.business_payment_accounts;
create trigger trg_bpa_updated before update on public.business_payment_accounts
  for each row execute function public.set_updated_at();

alter table public.business_payment_accounts enable row level security;
do $$ begin
  begin drop policy "bpa_manager_read" on public.business_payment_accounts; exception when undefined_object then null; end;
end $$;
create policy "bpa_manager_read" on public.business_payment_accounts for select to authenticated
  using (public.manages_business(business_id));
-- no insert/update/delete policies: service role only.

-- ── 2. membership_subscriptions ─────────────────────────────────────────
create table if not exists public.membership_subscriptions (
  id                       uuid primary key default uuid_generate_v4(),
  membership_id            uuid not null references public.business_memberships(id) on delete cascade,
  business_id              uuid not null references public.businesses(id) on delete cascade,
  provider                 text not null check (provider in ('stripe','square','clover','manual')),
  provider_customer_id     text,
  /** Stripe sub_… for monthly; null for a one-time pass. */
  provider_subscription_id text,
  /** Stripe cs_… of the checkout that created it (audit / dedupe). */
  provider_checkout_id     text,
  plan_kind                text not null check (plan_kind in ('monthly','pass')),
  plan_label               text,
  pass_months              int,
  price_cents              int,
  currency                 text not null default 'usd',
  status                   text not null default 'incomplete'
                           check (status in ('incomplete','trialing','active','past_due','canceled','unpaid','expired')),
  current_period_start     timestamptz,
  current_period_end       timestamptz,
  cancel_at_period_end     boolean not null default false,
  canceled_at              timestamptz,
  ended_at                 timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create unique index if not exists msub_provider_sub_uidx
  on public.membership_subscriptions(provider, provider_subscription_id) where provider_subscription_id is not null;
create index if not exists msub_membership_idx on public.membership_subscriptions(membership_id, created_at desc);
create index if not exists msub_business_status_idx on public.membership_subscriptions(business_id, status);
drop trigger if exists trg_msub_updated on public.membership_subscriptions;
create trigger trg_msub_updated before update on public.membership_subscriptions
  for each row execute function public.set_updated_at();

alter table public.membership_subscriptions enable row level security;
do $$ begin
  begin drop policy "msub_self_read"  on public.membership_subscriptions; exception when undefined_object then null; end;
  begin drop policy "msub_staff_read" on public.membership_subscriptions; exception when undefined_object then null; end;
end $$;
create policy "msub_self_read" on public.membership_subscriptions for select to authenticated
  using (exists (select 1 from public.business_memberships m where m.id = membership_id and m.user_id = auth.uid()));
create policy "msub_staff_read" on public.membership_subscriptions for select to authenticated
  using (public.staffs_business(business_id));

-- ── 3. membership_payments ──────────────────────────────────────────────
create table if not exists public.membership_payments (
  id                   uuid primary key default uuid_generate_v4(),
  subscription_id      uuid references public.membership_subscriptions(id) on delete set null,
  membership_id        uuid references public.business_memberships(id) on delete set null,
  business_id          uuid not null references public.businesses(id) on delete cascade,
  provider             text not null,
  /** Stripe in_… (invoice) or pi_… (one-time). Unique per provider. */
  provider_payment_id  text not null,
  amount_cents         int not null,
  currency             text not null default 'usd',
  status               text not null check (status in ('paid','failed','refunded','pending')),
  receipt_url          text,
  failure_reason       text,
  paid_at              timestamptz,
  created_at           timestamptz not null default now(),
  unique (provider, provider_payment_id)
);
create index if not exists mpay_business_idx on public.membership_payments(business_id, created_at desc);
alter table public.membership_payments enable row level security;
do $$ begin
  begin drop policy "mpay_self_read"  on public.membership_payments; exception when undefined_object then null; end;
  begin drop policy "mpay_staff_read" on public.membership_payments; exception when undefined_object then null; end;
end $$;
create policy "mpay_self_read" on public.membership_payments for select to authenticated
  using (exists (select 1 from public.business_memberships m where m.id = membership_id and m.user_id = auth.uid()));
create policy "mpay_staff_read" on public.membership_payments for select to authenticated
  using (public.manages_business(business_id));

-- ── 4. payment_events (idempotency) ─────────────────────────────────────
create table if not exists public.payment_events (
  provider      text not null,
  event_id      text not null,
  event_type    text not null,
  business_id   uuid,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz,
  outcome       text,
  payload       jsonb,
  primary key (provider, event_id)
);
alter table public.payment_events enable row level security;  -- no policies: service role only.

-- ── 5. the state machine ────────────────────────────────────────────────
-- Called ONLY by server routes with the service role. One call per
-- normalised provider event. Returns what it did (for logs).
--
--   p_kind: 'checkout_completed' | 'invoice_paid' | 'invoice_failed'
--         | 'subscription_updated' | 'subscription_deleted'
drop function if exists public.apply_membership_event(text, text, text, uuid, uuid, text, text, text, text, text, int, int, timestamptz, timestamptz, boolean, text, int, text, text, text);
create function public.apply_membership_event(
  p_provider            text,
  p_event_id            text,
  p_kind                text,
  p_business_id         uuid,
  p_user_id             uuid,
  p_customer_id         text default null,
  p_subscription_id     text default null,
  p_checkout_id         text default null,
  p_plan_kind           text default null,       -- 'monthly' | 'pass'
  p_plan_label          text default null,
  p_pass_months         int  default null,
  p_price_cents         int  default null,
  p_period_start        timestamptz default null,
  p_period_end          timestamptz default null,
  p_cancel_at_period_end boolean default null,
  p_sub_status          text default null,       -- provider's own status word
  p_payment_amount      int  default null,
  p_payment_id          text default null,
  p_receipt_url         text default null,
  p_failure_reason      text default null
)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_mem_id   uuid;
  v_sub_id   uuid;
  v_status   text;
  v_expires  timestamptz;
  v_grace    interval := interval '3 days';   -- keep access while Stripe retries a failed card
begin
  -- Idempotency: first writer wins.
  insert into public.payment_events (provider, event_id, event_type, business_id)
  values (p_provider, p_event_id, p_kind, p_business_id)
  on conflict do nothing;
  if not found then return 'duplicate'; end if;

  -- Membership row (create it if the buyer somehow isn't enrolled yet).
  if p_user_id is not null then
    select id into v_mem_id from public.business_memberships
     where business_id = p_business_id and user_id = p_user_id;
    if v_mem_id is null then
      insert into public.business_memberships (business_id, user_id, status)
      values (p_business_id, p_user_id, 'active') returning id into v_mem_id;
    end if;
  end if;

  -- Subscription row: by provider subscription id, else by checkout id, else newest for member.
  if p_subscription_id is not null then
    select id into v_sub_id from public.membership_subscriptions
     where provider = p_provider and provider_subscription_id = p_subscription_id;
  end if;
  if v_sub_id is null and p_checkout_id is not null then
    select id into v_sub_id from public.membership_subscriptions
     where provider = p_provider and provider_checkout_id = p_checkout_id;
  end if;
  if v_sub_id is null and v_mem_id is not null and p_kind <> 'checkout_completed' then
    select id into v_sub_id from public.membership_subscriptions
     where membership_id = v_mem_id and provider = p_provider
     order by created_at desc limit 1;
  end if;
  if v_mem_id is null and v_sub_id is not null then
    select membership_id into v_mem_id from public.membership_subscriptions where id = v_sub_id;
  end if;
  if v_mem_id is null then
    update public.payment_events set processed_at = now(), outcome = 'no_membership'
     where provider = p_provider and event_id = p_event_id;
    return 'no_membership';
  end if;

  -- Map provider status → ours.
  v_status := case
    when p_sub_status in ('active','trialing','past_due','canceled','unpaid','incomplete') then p_sub_status
    when p_sub_status = 'incomplete_expired' then 'expired'
    else null end;

  if p_kind = 'checkout_completed' then
    if v_sub_id is null then
      insert into public.membership_subscriptions
        (membership_id, business_id, provider, provider_customer_id, provider_subscription_id, provider_checkout_id,
         plan_kind, plan_label, pass_months, price_cents, status, current_period_start, current_period_end, cancel_at_period_end)
      values
        (v_mem_id, p_business_id, p_provider, p_customer_id, p_subscription_id, p_checkout_id,
         coalesce(p_plan_kind, case when p_subscription_id is null then 'pass' else 'monthly' end),
         p_plan_label, p_pass_months, p_price_cents,
         coalesce(v_status, 'active'),
         coalesce(p_period_start, now()),
         coalesce(p_period_end, case when p_pass_months is not null then now() + make_interval(months => p_pass_months) else null end),
         coalesce(p_cancel_at_period_end, false))
      returning id into v_sub_id;
    else
      update public.membership_subscriptions
         set provider_customer_id = coalesce(p_customer_id, provider_customer_id),
             provider_subscription_id = coalesce(p_subscription_id, provider_subscription_id),
             status = coalesce(v_status, status),
             current_period_end = coalesce(p_period_end, current_period_end)
       where id = v_sub_id;
    end if;
    -- A pass closes any older still-open subscription rows for this member.
    update public.membership_subscriptions
       set status = 'canceled', ended_at = now()
     where membership_id = v_mem_id and id <> v_sub_id and status in ('active','past_due','trialing','incomplete')
       and plan_kind = 'pass';

  elsif p_kind = 'invoice_paid' then
    update public.membership_subscriptions
       set status = 'active',
           current_period_start = coalesce(p_period_start, current_period_start),
           current_period_end   = coalesce(p_period_end, current_period_end),
           provider_customer_id = coalesce(p_customer_id, provider_customer_id)
     where id = v_sub_id;

  elsif p_kind = 'invoice_failed' then
    update public.membership_subscriptions set status = 'past_due' where id = v_sub_id;

  elsif p_kind = 'subscription_updated' then
    update public.membership_subscriptions
       set status = coalesce(v_status, status),
           current_period_start = coalesce(p_period_start, current_period_start),
           current_period_end   = coalesce(p_period_end, current_period_end),
           cancel_at_period_end = coalesce(p_cancel_at_period_end, cancel_at_period_end),
           canceled_at = case when coalesce(p_cancel_at_period_end, false) and canceled_at is null then now()
                              when p_cancel_at_period_end = false then null else canceled_at end
     where id = v_sub_id;

  elsif p_kind = 'subscription_deleted' then
    update public.membership_subscriptions
       set status = 'canceled', ended_at = now(), canceled_at = coalesce(canceled_at, now())
     where id = v_sub_id;
  end if;

  -- Ledger line (paid / failed).
  if p_payment_id is not null then
    insert into public.membership_payments
      (subscription_id, membership_id, business_id, provider, provider_payment_id, amount_cents,
       status, receipt_url, failure_reason, paid_at)
    values
      (v_sub_id, v_mem_id, p_business_id, p_provider, p_payment_id, coalesce(p_payment_amount, p_price_cents, 0),
       case when p_kind = 'invoice_failed' then 'failed' else 'paid' end,
       p_receipt_url, p_failure_reason, case when p_kind = 'invoice_failed' then null else now() end)
    on conflict (provider, provider_payment_id) do nothing;
  end if;

  -- Project onto the membership row the rest of the app already reads.
  select case
           when s.status in ('active','trialing') then coalesce(s.current_period_end, now() + interval '100 years') + v_grace
           when s.status = 'past_due'             then coalesce(s.current_period_end, now()) + v_grace
           when s.status in ('canceled','unpaid','expired','incomplete') then coalesce(s.current_period_end, now())
         end
    into v_expires
    from public.membership_subscriptions s where s.id = v_sub_id;

  update public.business_memberships m
     set membership_payment_status = case
           when (select status from public.membership_subscriptions where id = v_sub_id) in ('active','trialing') then 'paid'
           when (select status from public.membership_subscriptions where id = v_sub_id) = 'past_due' then 'past_due'
           when v_expires is not null and v_expires > now() then 'paid'     -- canceled but period not over
           else 'lapsed' end,
         membership_paid_at    = case when p_kind in ('checkout_completed','invoice_paid') then now() else m.membership_paid_at end,
         membership_plan_label = coalesce((select plan_label from public.membership_subscriptions where id = v_sub_id), m.membership_plan_label),
         membership_expires_at = case when (select plan_kind from public.membership_subscriptions where id = v_sub_id) = 'monthly'
                                       and (select status from public.membership_subscriptions where id = v_sub_id) in ('active','trialing')
                                       and (select current_period_end from public.membership_subscriptions where id = v_sub_id) is null
                                      then null else v_expires end,
         membership_pending_plan = null,
         status = case when m.status = 'pending' then 'active' else m.status end,
         updated_at = now()
   where m.id = v_mem_id;

  update public.payment_events set processed_at = now(), outcome = 'ok'
   where provider = p_provider and event_id = p_event_id;
  return 'ok';
end; $$;
revoke all on function public.apply_membership_event(text, text, text, uuid, uuid, text, text, text, text, text, int, int, timestamptz, timestamptz, boolean, text, int, text, text, text) from public;
grant execute on function public.apply_membership_event(text, text, text, uuid, uuid, text, text, text, text, text, int, int, timestamptz, timestamptz, boolean, text, int, text, text, text) to service_role;

-- ── 6. reads the app needs ──────────────────────────────────────────────
-- Builder + join modal: is card checkout live for this business? (no secrets)
drop function if exists public.payment_account_public(uuid);
create function public.payment_account_public(p_business_id uuid)
returns table (provider text, connected boolean, charges_enabled boolean, payouts_enabled boolean, details_submitted boolean, connected_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.provider, a.provider_account_id is not null and a.disconnected_at is null,
         a.charges_enabled, a.payouts_enabled, a.details_submitted, a.connected_at
    from public.business_payment_accounts a
   where a.business_id = p_business_id and a.disconnected_at is null;
$$;
grant execute on function public.payment_account_public(uuid) to anon, authenticated;

-- Customer: my current subscription at this business (drives "Manage membership").
drop function if exists public.my_membership_subscription(uuid);
create function public.my_membership_subscription(p_business_id uuid)
returns table (
  id uuid, provider text, plan_kind text, plan_label text, price_cents int, status text,
  current_period_end timestamptz, cancel_at_period_end boolean, has_portal boolean
)
language sql stable security definer set search_path = public as $$
  select s.id, s.provider, s.plan_kind, s.plan_label, s.price_cents, s.status,
         s.current_period_end, s.cancel_at_period_end,
         (s.provider = 'stripe' and s.provider_customer_id is not null)
    from public.membership_subscriptions s
    join public.business_memberships m on m.id = s.membership_id
   where s.business_id = p_business_id and m.user_id = auth.uid()
   order by case when s.status in ('active','trialing','past_due') then 0 else 1 end, s.created_at desc
   limit 1;
$$;
grant execute on function public.my_membership_subscription(uuid) to authenticated;

-- Desk: subscription status for a scanned member (feeds the VIP strip).
drop function if exists public.member_subscription_status(uuid);
create function public.member_subscription_status(p_membership_id uuid)
returns table (provider text, plan_kind text, plan_label text, status text, current_period_end timestamptz, cancel_at_period_end boolean, last_paid_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.provider, s.plan_kind, s.plan_label, s.status, s.current_period_end, s.cancel_at_period_end,
         (select max(p.paid_at) from public.membership_payments p where p.subscription_id = s.id and p.status = 'paid')
    from public.membership_subscriptions s
    join public.business_memberships m on m.id = s.membership_id
   where s.membership_id = p_membership_id and public.staffs_business(m.business_id)
   order by case when s.status in ('active','trialing','past_due') then 0 else 1 end, s.created_at desc
   limit 1;
$$;
grant execute on function public.member_subscription_status(uuid) to authenticated;

-- ── verify ──────────────────────────────────────────────────────────────
-- select * from public.payment_account_public('<business uuid>');
