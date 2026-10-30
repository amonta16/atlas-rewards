-- =====================================================================
-- CHECKPOINT 11 — Webhooks (inbound + outbound)
-- =====================================================================

-- Enable pg_net for outbound HTTP from Postgres triggers
create extension if not exists pg_net;

-- =====================================================================
-- Inbound webhook secret per business
-- (Each business gets one secret. External systems sign their POSTs with it.)
-- =====================================================================
alter table public.businesses
  add column if not exists webhook_secret text;

-- Backfill any missing secrets
update public.businesses
   set webhook_secret = encode(gen_random_bytes(32), 'hex')
 where webhook_secret is null;

alter table public.businesses
  alter column webhook_secret set not null,
  alter column webhook_secret set default encode(gen_random_bytes(32), 'hex');

-- =====================================================================
-- Webhook deliveries log
-- =====================================================================
create table if not exists public.webhook_deliveries (
  id            uuid primary key default uuid_generate_v4(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  endpoint_id   uuid references public.webhook_endpoints(id) on delete set null,
  direction     text not null check (direction in ('inbound', 'outbound')),
  event_type    text not null,
  url           text,
  payload       jsonb,
  status_code   int,
  response_body text,
  error         text,
  request_id    bigint,
  created_at    timestamptz not null default now()
);
create index if not exists webhook_deliveries_business_idx
  on public.webhook_deliveries(business_id, created_at desc);

alter table public.webhook_deliveries enable row level security;
do $$
begin
  begin drop policy "wh_del_staff" on public.webhook_deliveries; exception when undefined_object then null; end;
end $$;
create policy "wh_del_staff" on public.webhook_deliveries for select to authenticated
  using (public.staffs_business(business_id));

-- =====================================================================
-- regenerate_webhook_secret: rotate the inbound secret
-- =====================================================================
create or replace function public.regenerate_webhook_secret(p_business_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_secret text;
begin
  if not public.staffs_business(p_business_id) then raise exception 'permission denied'; end if;
  v_secret := encode(gen_random_bytes(32), 'hex');
  update public.businesses set webhook_secret = v_secret where id = p_business_id;
  return v_secret;
end; $$;
grant execute on function public.regenerate_webhook_secret(uuid) to authenticated;

-- =====================================================================
-- upsert_webhook_endpoint: outbound endpoint CRUD
-- =====================================================================
create or replace function public.upsert_webhook_endpoint(
  p_id           uuid,
  p_business_id  uuid,
  p_url          text,
  p_events       text[],
  p_is_active    boolean default true
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.staffs_business(p_business_id) then raise exception 'permission denied'; end if;
  if p_id is null then
    insert into public.webhook_endpoints (business_id, url, secret, events, is_active)
    values (p_business_id, p_url, encode(gen_random_bytes(24), 'hex'), p_events, p_is_active)
    returning id into v_id;
  else
    update public.webhook_endpoints
       set url = p_url, events = p_events, is_active = p_is_active
     where id = p_id and business_id = p_business_id
    returning id into v_id;
  end if;
  return v_id;
end; $$;
grant execute on function public.upsert_webhook_endpoint(uuid, uuid, text, text[], boolean) to authenticated;

create or replace function public.delete_webhook_endpoint(p_id uuid, p_business_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.staffs_business(p_business_id) then raise exception 'permission denied'; end if;
  delete from public.webhook_endpoints where id = p_id and business_id = p_business_id;
end; $$;
grant execute on function public.delete_webhook_endpoint(uuid, uuid) to authenticated;

-- =====================================================================
-- Outbound dispatcher: trigger fires on points_ledger inserts
-- Fans out to every active webhook endpoint subscribed to this event type.
-- =====================================================================
create or replace function public.dispatch_outbound_webhooks()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_ep         record;
  v_payload    jsonb;
  v_event      text;
  v_member_uid uuid;
  v_member_em  text;
  v_req_id     bigint;
begin
  -- Translate rule_type to a webhook event name
  v_event := case
    when new.delta > 0 then 'points.awarded'
    when new.delta < 0 then 'points.redeemed'
    else 'points.adjusted'
  end;

  -- Look up member identity for richer payload
  select m.user_id, p.email into v_member_uid, v_member_em
    from public.business_memberships m
    join public.profiles p on p.id = m.user_id
   where m.id = new.membership_id;

  v_payload := jsonb_build_object(
    'event',          v_event,
    'rule_type',      new.rule_type,
    'business_id',    new.business_id,
    'membership_id',  new.membership_id,
    'member_email',   v_member_em,
    'delta',          new.delta,
    'balance_after',  new.balance_after,
    'reference_id',   new.reference_id,
    'occurred_at',    new.created_at
  );

  -- Fan out to every subscribed active endpoint
  for v_ep in
    select * from public.webhook_endpoints
     where business_id = new.business_id
       and is_active
       and (v_event = any(events) or 'all' = any(events))
  loop
    begin
      select net.http_post(
        url := v_ep.url,
        body := v_payload,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'X-Atlas-Signature', encode(hmac(v_payload::text, v_ep.secret, 'sha256'), 'hex'),
          'X-Atlas-Event', v_event
        )
      ) into v_req_id;

      insert into public.webhook_deliveries
        (business_id, endpoint_id, direction, event_type, url, payload, request_id)
      values
        (new.business_id, v_ep.id, 'outbound', v_event, v_ep.url, v_payload, v_req_id);
    exception when others then
      insert into public.webhook_deliveries
        (business_id, endpoint_id, direction, event_type, url, payload, error)
      values
        (new.business_id, v_ep.id, 'outbound', v_event, v_ep.url, v_payload, sqlerrm);
    end;
  end loop;

  return new;
end; $$;

drop trigger if exists trg_dispatch_outbound on public.points_ledger;
create trigger trg_dispatch_outbound
  after insert on public.points_ledger
  for each row execute function public.dispatch_outbound_webhooks();

-- =====================================================================
-- Inbound handler: called by the Next.js API route after signature check
-- (Wraps award_points with a "find member by email/code" lookup)
-- =====================================================================
create or replace function public.inbound_webhook_award(
  p_business_id     uuid,
  p_member_email    text default null,
  p_member_code     text default null,
  p_rule_type       text default 'purchase',
  p_amount_cents    int  default null,
  p_idempotency_key text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_membership   uuid;
  v_user         uuid;
  v_pts          int;
  v_award        record;
begin
  -- Find the member
  if p_member_code is not null then
    select id into v_membership from public.business_memberships
     where business_id = p_business_id and referral_code = upper(p_member_code);
  elsif p_member_email is not null then
    select m.id into v_membership
      from public.business_memberships m
      join public.profiles p on p.id = m.user_id
     where m.business_id = p_business_id and lower(p.email::text) = lower(p_member_email);
  end if;

  if v_membership is null then
    return jsonb_build_object('success', false, 'error', 'member not found');
  end if;

  -- Compute points
  if p_rule_type = 'purchase' and p_amount_cents is not null then
    select coalesce((point_rules->>'purchase_per_dollar')::int, 0) * (p_amount_cents / 100)
      into v_pts from public.businesses where id = p_business_id;
  else
    select coalesce((point_rules->>p_rule_type)::int, 0)
      into v_pts from public.businesses where id = p_business_id;
  end if;

  if v_pts <= 0 then
    return jsonb_build_object('success', false, 'error', 'no points configured for ' || p_rule_type);
  end if;

  select * into v_award from public.award_points(
    v_membership, v_pts, p_rule_type, null,
    coalesce(p_idempotency_key, 'wh_' || gen_random_uuid()::text),
    'Awarded via webhook'
  );

  -- Log inbound delivery
  insert into public.webhook_deliveries
    (business_id, direction, event_type, payload, status_code)
  values
    (p_business_id, 'inbound', p_rule_type,
     jsonb_build_object('member_email', p_member_email, 'amount_cents', p_amount_cents, 'points', v_pts),
     200);

  return jsonb_build_object('success', true, 'ledger_id', v_award.ledger_id,
                            'points_awarded', v_pts, 'new_balance', v_award.new_balance);
end; $$;
-- Only callable via service_role (the API route uses service_role)
revoke execute on function public.inbound_webhook_award from public;
revoke execute on function public.inbound_webhook_award from authenticated;
grant execute on function public.inbound_webhook_award(uuid, text, text, text, int, text) to service_role;
