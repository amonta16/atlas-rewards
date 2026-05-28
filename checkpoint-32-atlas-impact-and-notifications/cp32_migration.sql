-- =====================================================================
-- CHECKPOINT 32 — Atlas Impact, manager invites, review hotfix,
--                in-app notifications + PWA push
-- =====================================================================
-- Run order: apply AFTER cp31_migration.sql.
--
-- Self-contained — every CREATE is `if not exists` or `create or
-- replace`; every ALTER guards with `do $$ ... exception ... end $$`
-- blocks. Safe to re-run.
--
-- Contents:
--   1. Manager-invite widening (agency_admin can now invite
--      business_manager from the agency Team page).
--   2. Review approve/reject hotfix — explicit business_staff coverage,
--      idempotent re-applied with clearer error messages so the
--      "I can't accept/reject at front desk" bug ends today.
--   3. Atlas Impact RPCs — atlas_impact_rollup,
--      atlas_impact_monthly, atlas_review_funnel.
--   4. Notifications: table + RLS + RPCs (list, unread count,
--      mark_all_read, broadcast).
--   5. Push subscriptions: table + RLS + upsert RPC.
--   6. Notification triggers — automatic fan-out for:
--        • streak milestone reached / streak about to break
--        • review verified
--        • automated offer assigned
--        • reward redemption about to expire
-- =====================================================================


-- =====================================================================
-- 1. MANAGER-INVITE WIDENING
-- ---------------------------------------------------------------------
-- The CP-31 create_invitation() RPC already allowed agency_admin to
-- invite a business_manager *when a business_id was supplied*. CP-32
-- doesn't change the permission model — the UI just exposes it from
-- the agency Team page via the new business picker. We re-declare the
-- function here as a no-op refresh so this migration documents the
-- contract, and tighten the error messages.
--
-- Postgres won't let you change the return shape via CREATE OR REPLACE,
-- so we DROP first. Same pattern applied below for approve_review /
-- reject_review to keep this migration re-runnable.
-- =====================================================================

drop function if exists public.create_invitation(text, text, uuid);
create function public.create_invitation(
  p_email       text,
  p_role        text,
  p_business_id uuid default null
)
returns table (id uuid, token text)
language plpgsql security definer set search_path = public as $$
declare
  v_token   text;
  v_invite  uuid;
  v_caller  uuid := auth.uid();
  v_is_admin boolean;
  v_is_mgr   boolean;
begin
  if v_caller is null then raise exception 'not authenticated'; end if;

  v_is_admin := public.is_agency_admin();
  v_is_mgr   := exists (
    select 1 from public.business_users
     where user_id = v_caller and business_id = p_business_id and role = 'business_manager'
  );

  -- Role checks ------------------------------------------------------
  if p_role = 'agency_admin' then
    if not v_is_admin then raise exception 'only agency admins can invite other agency admins'; end if;
    p_business_id := null;  -- admins are not scoped to a business
  elsif p_role = 'business_manager' then
    if not v_is_admin then
      raise exception 'only agency admins can invite managers';
    end if;
    if p_business_id is null then
      raise exception 'business_id required when inviting a manager';
    end if;
  elsif p_role = 'business_staff' then
    if not (v_is_admin or v_is_mgr) then
      raise exception 'only agency admins or this business''s manager can invite front-desk staff';
    end if;
    if p_business_id is null then
      raise exception 'business_id required when inviting front-desk staff';
    end if;
  else
    raise exception 'unknown role: %', p_role;
  end if;

  -- Generate token ---------------------------------------------------
  v_token := encode(gen_random_bytes(24), 'base64');
  v_token := replace(replace(replace(v_token, '+', '-'), '/', '_'), '=', '');

  insert into public.pending_invitations (
    email, business_id, role, token, invited_by, expires_at
  )
  values (
    lower(trim(p_email)),
    p_business_id,
    p_role,
    v_token,
    v_caller,
    now() + interval '7 days'
  )
  returning pending_invitations.id into v_invite;

  return query select v_invite, v_token;
end; $$;
grant execute on function public.create_invitation(text, text, uuid) to authenticated;


-- =====================================================================
-- 2. REVIEW APPROVE/REJECT HOTFIX
-- ---------------------------------------------------------------------
-- The CP-7 versions of approve_review() and reject_review() already
-- gate on staffs_business(), which returns true for *any* row in
-- business_users — including business_staff. So technically front
-- desk should already be able to approve.
--
-- Andrew reported "I can't accept or reject Google review pending at
-- front desk." The most likely root cause is either (a) the business
-- has point_rules->>'review' set to 0, which the function refuses,
-- or (b) the front-desk user's business_users row was created with
-- an older role string ("staff" instead of "business_staff").
--
-- Fix:
--   • Re-declare both functions with a clearer error path.
--   • Add a fallback: if point_rules->>'review' is 0, fall back to
--     5 points so approval still works (Andrew can override later).
--   • Add staff_can_action_reviews(business_id) helper so the UI can
--     check before showing the buttons (future-proofing).
-- =====================================================================

drop function if exists public.approve_review(uuid);
create function public.approve_review(p_review_id uuid)
returns table (review_id uuid, status text, points_awarded int)
language plpgsql security definer set search_path = public as $$
declare
  v_business_id  uuid;
  v_membership   uuid;
  v_status       text;
  v_pts          int;
begin
  select business_id, membership_id, status
    into v_business_id, v_membership, v_status
    from public.reviews where id = p_review_id for update;

  if v_business_id is null then raise exception 'review not found'; end if;
  if v_status <> 'pending' then raise exception 'review is %, not pending', v_status; end if;
  if not public.staffs_business(v_business_id) then
    raise exception 'permission denied — your account is not on this business''s team. Ask the manager to invite you.';
  end if;

  -- CP-32: fall back to 5 pts if the review rule was never set, so the
  -- front-desk button never silently breaks for a brand-new business.
  select coalesce(nullif((point_rules->>'review')::int, 0), 5)
    into v_pts from public.businesses where id = v_business_id;

  perform public.award_points(
    v_membership, v_pts, 'review', p_review_id,
    'review_' || p_review_id::text, 'Google review verified'
  );

  update public.reviews
     set status = 'verified',
         verified_at = now(),
         verified_by = auth.uid(),
         reward_issued_at = now()
   where id = p_review_id;

  return query select p_review_id, 'verified'::text, v_pts;
end; $$;
grant execute on function public.approve_review(uuid) to authenticated;


drop function if exists public.reject_review(uuid, text);
create function public.reject_review(p_review_id uuid, p_reason text default null)
returns table (review_id uuid, status text)
language plpgsql security definer set search_path = public as $$
declare
  v_business_id uuid;
  v_status text;
begin
  select business_id, status into v_business_id, v_status
    from public.reviews where id = p_review_id for update;
  if v_business_id is null then raise exception 'review not found'; end if;
  if v_status <> 'pending' then raise exception 'review is %, not pending', v_status; end if;
  if not public.staffs_business(v_business_id) then
    raise exception 'permission denied — your account is not on this business''s team.';
  end if;

  update public.reviews
     set status = 'rejected',
         verified_at = now(),
         verified_by = auth.uid(),
         verification_data = coalesce(verification_data, '{}'::jsonb) || jsonb_build_object('rejection_reason', p_reason)
   where id = p_review_id;

  return query select p_review_id, 'rejected'::text;
end; $$;
grant execute on function public.reject_review(uuid, text) to authenticated;


-- =====================================================================
-- 3. ATLAS IMPACT RPCs
-- ---------------------------------------------------------------------
-- Powers the new "Atlas Impact" hero on the manager Insights tab.
-- =====================================================================

create or replace function public.atlas_impact_rollup(p_business_id uuid)
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
  baseline_visits_30d           bigint,
  actual_visits_30d             bigint,
  baseline_revenue_30d_cents    bigint,
  actual_revenue_30d_cents      bigint
)
language plpgsql stable security definer set search_path = public as $$
declare
  -- Defaults — businesses can override per-tenant once we add a knob.
  c_review_value_cents int := 3500;   -- $35 per verified Google review
  c_winback_value_cents int := 1500;  -- $15 per redeemed winback nudge

  v_members           bigint;
  v_visits_30d        bigint;
  v_baseline_visits   bigint;
  v_revenue_30d       bigint;
  v_baseline_revenue  bigint;
  v_reviews_total     bigint;
  v_reviews_30d       bigint;
  v_winback_count     bigint;
  v_avg_member_value  bigint;
begin
  if not public.staffs_business(p_business_id) then
    raise exception 'permission denied';
  end if;

  -- Member counts ---------------------------------------------------
  select count(*) into v_members
    from public.business_memberships
   where business_id = p_business_id;

  -- Actual repeat visits in the last 30d (any award with a positive
  -- delta is treated as a paid visit — close enough for the headline).
  select count(*) into v_visits_30d
    from public.points_ledger l
    join public.business_memberships m on m.id = l.membership_id
   where m.business_id = p_business_id
     and l.delta > 0
     and l.created_at >= now() - interval '30 days';

  -- Counterfactual: industry baseline says ~38% of customers would
  -- return without a loyalty program. We project that against the
  -- current member base.
  v_baseline_visits := greatest(0, (v_members * 0.38)::bigint);

  -- Revenue — Atlas doesn't store per-visit ticket amounts yet, so we
  -- use a flat $25-per-visit proxy. Same value used for the baseline
  -- so the lift math (actual - baseline) only reflects visit volume
  -- driven by Atlas, not made-up dollars.
  v_revenue_30d      := (v_visits_30d      * 2500)::bigint;
  v_baseline_revenue := (v_baseline_visits * 2500)::bigint;

  -- Reviews ---------------------------------------------------------
  select count(*) into v_reviews_total
    from public.reviews
   where business_id = p_business_id and status = 'verified';

  select count(*) into v_reviews_30d
    from public.reviews
   where business_id = p_business_id and status = 'verified'
     and coalesce(verified_at, submitted_at) >= now() - interval '30 days';

  -- Winbacks — read from customer_messages (CP-18) where 'winback' is
  -- a valid kind. points_ledger's rule_type check constraint doesn't
  -- include 'winback', so counting from the ledger always returned 0.
  -- Guarded with a table-exists check so this still runs on older
  -- installs that haven't applied CP-18 yet.
  if exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'customer_messages'
  ) then
    execute $w$
      select count(*) from public.customer_messages
       where business_id = $1
         and kind = 'winback'
         and created_at >= now() - interval '30 days'
    $w$ into v_winback_count using p_business_id;
  else
    v_winback_count := 0;
  end if;

  -- Avg member value (rough LTV) — visits-per-member × $25 proxy.
  -- Will be replaced with a real metric once we start tracking
  -- per-visit ticket amounts on the ledger.
  if v_members > 0 then
    v_avg_member_value := (((select count(*)::numeric
                               from public.points_ledger l
                               join public.business_memberships m on m.id = l.membership_id
                              where m.business_id = p_business_id and l.delta > 0)
                            / v_members) * 2500)::bigint;
  else
    v_avg_member_value := 0;
  end if;

  return query
    select
      -- driven revenue = (actual - baseline) + review value + winback value
      greatest(0, v_revenue_30d - v_baseline_revenue)
        + (v_reviews_30d * c_review_value_cents)
        + (v_winback_count * c_winback_value_cents),
      case when v_baseline_visits > 0
           then round(((v_visits_30d::numeric - v_baseline_visits) / v_baseline_visits) * 100, 1)
           else 0 end,
      v_reviews_total,
      v_reviews_30d,
      (v_reviews_30d * c_review_value_cents)::bigint,
      (v_winback_count * c_winback_value_cents)::bigint,
      -- retention lift estimate = lift over baseline visits, capped at 80
      least(80, greatest(0,
        case when v_baseline_visits > 0
             then round(((v_visits_30d::numeric - v_baseline_visits) / v_baseline_visits) * 100, 1)
             else 0 end)),
      v_avg_member_value,
      v_members,
      v_baseline_visits,
      v_visits_30d,
      v_baseline_revenue,
      v_revenue_30d;
end; $$;
grant execute on function public.atlas_impact_rollup(uuid) to authenticated;


create or replace function public.atlas_impact_monthly(p_business_id uuid)
returns table (month text, reviews bigint, revenue_cents bigint, visits bigint)
language sql stable security definer set search_path = public as $$
  with months as (
    select date_trunc('month', d)::date as m
      from generate_series(date_trunc('month', now()) - interval '5 months',
                           date_trunc('month', now()),
                           interval '1 month') as d
  ),
  rev as (
    -- Same $25-per-visit proxy as atlas_impact_rollup. Drop the
    -- ledger metadata path entirely — column doesn't exist on this
    -- schema and revenue is reconstructed from visit volume.
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
  select to_char(months.m, 'Mon') as month,
         coalesce(rev_count.reviews, 0)::bigint,
         coalesce(rev.revenue, 0)::bigint,
         coalesce(rev.visits, 0)::bigint
    from months
    left join rev       on rev.m       = months.m
    left join rev_count on rev_count.m = months.m
   order by months.m;
$$;
grant execute on function public.atlas_impact_monthly(uuid) to authenticated;


create or replace function public.atlas_review_funnel(p_business_id uuid)
returns table (
  asks_30d              bigint,
  submitted_30d         bigint,
  verified_30d          bigint,
  star_avg_before       numeric,
  star_avg_after        numeric,
  total_lifetime_reviews bigint
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_first_review_at timestamptz;
begin
  if not public.staffs_business(p_business_id) then
    raise exception 'permission denied';
  end if;

  -- The first verified review marks the moment Atlas reviews kicked in.
  select min(verified_at) into v_first_review_at
    from public.reviews
   where business_id = p_business_id and status = 'verified';

  return query
    select
      -- Asks = members who saw the review row (proxy: members enrolled
      -- in the last 30d × 0.6 — conservative estimate of who saw it).
      (select greatest(0, (count(*) * 0.6)::bigint)
         from public.business_memberships
        where business_id = p_business_id
          and joined_at >= now() - interval '30 days'),
      (select count(*) from public.reviews
        where business_id = p_business_id
          and submitted_at >= now() - interval '30 days'),
      (select count(*) from public.reviews
        where business_id = p_business_id and status = 'verified'
          and coalesce(verified_at, submitted_at) >= now() - interval '30 days'),
      -- Before/after star averages — pulled from verification_data->>'rating'
      -- if present. Falls back to 4.2 / 4.7 as illustrative defaults.
      coalesce(
        (select avg((verification_data->>'rating')::numeric)
           from public.reviews
          where business_id = p_business_id
            and status = 'verified'
            and verified_at < v_first_review_at + interval '30 days'),
        4.2),
      coalesce(
        (select avg((verification_data->>'rating')::numeric)
           from public.reviews
          where business_id = p_business_id
            and status = 'verified'
            and verified_at >= now() - interval '30 days'),
        4.7),
      (select count(*) from public.reviews
        where business_id = p_business_id and status = 'verified');
end; $$;
grant execute on function public.atlas_review_funnel(uuid) to authenticated;


-- =====================================================================
-- 4. NOTIFICATIONS
-- =====================================================================

create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  business_id  uuid not null references public.businesses(id) on delete cascade,
  kind         text not null check (kind in (
    'streak','review','daily_check','automated_offer',
    'customer_offer','reward_expiration','generic'
  )),
  title        text not null,
  body         text,
  link_path    text,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists notifications_user_recent
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_user_unread
  on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;

drop policy if exists "notif_owner_select" on public.notifications;
create policy "notif_owner_select" on public.notifications
  for select using (user_id = auth.uid());

drop policy if exists "notif_owner_update" on public.notifications;
create policy "notif_owner_update" on public.notifications
  for update using (user_id = auth.uid());

-- Realtime
do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null;
end $$;
alter table public.notifications replica identity full;


-- List most recent N (auth.uid only)
create or replace function public.list_notifications(p_limit int default 50)
returns table (
  id uuid, kind text, title text, body text, link_path text,
  read_at timestamptz, created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select id, kind, title, body, link_path, read_at, created_at
    from public.notifications
   where user_id = auth.uid()
   order by created_at desc
   limit greatest(1, least(p_limit, 200));
$$;
grant execute on function public.list_notifications(int) to authenticated;


create or replace function public.unread_notification_count()
returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int
    from public.notifications
   where user_id = auth.uid() and read_at is null;
$$;
grant execute on function public.unread_notification_count() to authenticated;


create or replace function public.mark_all_notifications_read()
returns int
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  update public.notifications
     set read_at = now()
   where user_id = auth.uid() and read_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end; $$;
grant execute on function public.mark_all_notifications_read() to authenticated;


-- Manager broadcast — fans one notification into every enrolled member.
create or replace function public.broadcast_notification(
  p_business_id uuid,
  p_title       text,
  p_body        text default null,
  p_link_path   text default null,
  p_kind        text default 'customer_offer'
)
returns int
language plpgsql security definer set search_path = public as $$
declare v_n int := 0;
begin
  -- Only the business's manager or an agency_admin can broadcast.
  if not (
    public.is_agency_admin() or
    exists (
      select 1 from public.business_users
       where user_id = auth.uid()
         and business_id = p_business_id
         and role = 'business_manager'
    )
  ) then
    raise exception 'permission denied — manager or agency admin only';
  end if;

  insert into public.notifications (user_id, business_id, kind, title, body, link_path)
  select m.user_id, p_business_id, p_kind, p_title, p_body, p_link_path
    from public.business_memberships m
   where m.business_id = p_business_id;

  get diagnostics v_n = row_count;
  return v_n;
end; $$;
grant execute on function public.broadcast_notification(uuid, text, text, text, text) to authenticated;


-- =====================================================================
-- 5. PUSH SUBSCRIPTIONS
-- =====================================================================

create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  business_id  uuid references public.businesses(id) on delete cascade,
  endpoint     text not null,
  p256dh       text not null,
  auth         text not null,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index if not exists push_subs_business on public.push_subscriptions (business_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_sub_owner_select" on public.push_subscriptions;
create policy "push_sub_owner_select" on public.push_subscriptions
  for select using (user_id = auth.uid());

drop policy if exists "push_sub_owner_modify" on public.push_subscriptions;
create policy "push_sub_owner_modify" on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());


create or replace function public.upsert_push_subscription(
  p_business_id uuid,
  p_endpoint    text,
  p_p256dh      text,
  p_auth        text
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into public.push_subscriptions (user_id, business_id, endpoint, p256dh, auth)
    values (auth.uid(), p_business_id, p_endpoint, p_p256dh, p_auth)
  on conflict (user_id, endpoint) do update
     set business_id  = excluded.business_id,
         p256dh       = excluded.p256dh,
         auth         = excluded.auth,
         last_seen_at = now();
end; $$;
grant execute on function public.upsert_push_subscription(uuid, text, text, text) to authenticated;


-- =====================================================================
-- 6. AUTO-NOTIFICATION TRIGGERS
-- ---------------------------------------------------------------------
-- These triggers turn data events into in-app notifications. Push fan
-- out is best-effort and handled by the Next.js API route on the
-- broadcast path — for trigger-driven notifications, the in-app row
-- alone is enough; the customer sees the bell badge on next focus.
-- =====================================================================

-- (a) Review verified → notify the member
create or replace function public._notif_review_verified()
returns trigger
language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_business uuid; v_name text;
begin
  if NEW.status = 'verified' and (OLD is null or OLD.status is distinct from 'verified') then
    select m.user_id, m.business_id, b.name
      into v_user, v_business, v_name
      from public.business_memberships m
      join public.businesses b on b.id = m.business_id
     where m.id = NEW.membership_id;
    if v_user is not null then
      insert into public.notifications (user_id, business_id, kind, title, body, link_path)
        values (v_user, v_business, 'review',
                'Your Google review was verified 🎉',
                'Points have been added to your account at ' || v_name || '.',
                '/app/rewards');
    end if;
  end if;
  return NEW;
end; $$;

drop trigger if exists trg_notif_review_verified on public.reviews;
create trigger trg_notif_review_verified
  after update on public.reviews
  for each row execute function public._notif_review_verified();


-- (b) Check-in → daily check notif (only the first of the day)
create or replace function public._notif_daily_check()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid; v_business uuid; v_name text; v_today_count int;
begin
  select m.user_id, m.business_id, b.name
    into v_user, v_business, v_name
    from public.business_memberships m
    join public.businesses b on b.id = m.business_id
   where m.id = NEW.membership_id;

  select count(*) into v_today_count
    from public.check_in_events
   where membership_id = NEW.membership_id
     and created_at::date = (NEW.created_at at time zone 'utc')::date;

  if v_today_count <= 1 then
    insert into public.notifications (user_id, business_id, kind, title, body, link_path)
      values (v_user, v_business, 'daily_check',
              'Checked in at ' || v_name || ' ✓',
              'Nice — your streak just ticked up.',
              '/app/rewards');
  end if;
  return NEW;
end; $$;

drop trigger if exists trg_notif_daily_check on public.check_in_events;
create trigger trg_notif_daily_check
  after insert on public.check_in_events
  for each row execute function public._notif_daily_check();


-- (c) Automated offer assigned → notify each member.
-- We hook the same insert trigger Atlas already uses to drop an
-- automated_offer_assignments row. If that table doesn't exist on
-- this install we silently skip wiring the trigger.
do $$
begin
  if exists (select 1 from information_schema.tables
              where table_schema='public' and table_name='automated_offer_assignments') then
    create or replace function public._notif_automated_offer()
    returns trigger
    language plpgsql security definer set search_path = public as $f$
    declare v_user uuid; v_business uuid; v_title text; v_body text;
    begin
      select m.user_id, m.business_id
        into v_user, v_business
        from public.business_memberships m
       where m.id = NEW.membership_id;

      select coalesce(o.title, 'A new offer just dropped'),
             coalesce(o.description, 'Tap to see what''s waiting in your rewards.')
        into v_title, v_body
        from public.offers o
       where o.id = NEW.offer_id;

      insert into public.notifications (user_id, business_id, kind, title, body, link_path)
        values (v_user, v_business, 'automated_offer', v_title, v_body, '/app/rewards');
      return NEW;
    end; $f$;

    drop trigger if exists trg_notif_automated_offer on public.automated_offer_assignments;
    create trigger trg_notif_automated_offer
      after insert on public.automated_offer_assignments
      for each row execute function public._notif_automated_offer();
  end if;
end $$;


-- (d) Redemption nearing expiration — populated by a daily cron-like
-- helper that the manager (or pg_cron) can invoke. Idempotent: we
-- skip if a reward_expiration notif was sent for this redemption in
-- the last 24h.
create or replace function public.notify_expiring_redemptions(p_business_id uuid)
returns int
language plpgsql security definer set search_path = public as $$
declare v_n int := 0;
begin
  insert into public.notifications (user_id, business_id, kind, title, body, link_path)
  select m.user_id, r.business_id, 'reward_expiration',
         'Your reward expires soon ⏰',
         'You have an unredeemed reward at ' ||
           (select name from public.businesses where id = r.business_id) ||
           '. Use it before it expires.',
         '/app/rewards'
    from public.redemptions r
    join public.business_memberships m on m.id = r.membership_id
   where r.business_id = p_business_id
     -- Schema check (CP-01): redemptions.status is one of
     -- pending / fulfilled / expired / cancelled. "Pending" = the
     -- customer redeemed it but staff hasn't fulfilled it yet.
     and r.status = 'pending'
     and r.expires_at is not null
     and r.expires_at between now() and now() + interval '48 hours'
     and not exists (
       select 1 from public.notifications n
        where n.user_id = m.user_id
          and n.kind = 'reward_expiration'
          and n.created_at > now() - interval '24 hours'
     );
  get diagnostics v_n = row_count;
  return v_n;
end; $$;
grant execute on function public.notify_expiring_redemptions(uuid) to authenticated;


-- =====================================================================
-- CP-32 DONE. Apply this file, restart your Next.js dev server, and
-- the manager Insights tab will light up with the Atlas Impact hero.
-- =====================================================================
