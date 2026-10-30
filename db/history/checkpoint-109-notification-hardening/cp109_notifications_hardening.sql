-- =====================================================================
-- CP-109 — Notification system production-readiness hardening
-- =====================================================================
-- Idempotent + backward-compatible. Safe to paste into the Supabase SQL
-- editor as ONE run on the live database. Nothing here deletes user data;
-- the only rows touched are UNFIRED queue duplicates (section 6) and
-- push-subscription rows that already violate tenant rules (none expected).
--
-- Deploy order: apply this SQL FIRST, then deploy the matching app build.
-- Every change is compatible with the currently-deployed app, so there is
-- no window where anything breaks.
--
-- What this fixes (audit CP-109):
--
--  L1  list_pending_pushes / mark_pushed were EXECUTABLE BY ANY LOGGED-IN
--      USER. list_pending_pushes is SECURITY DEFINER and returns pending
--      notifications for EVERY user of EVERY business — titles, bodies,
--      user_ids. A direct cross-tenant read hole (and mark_pushed let
--      anyone suppress everyone's pushes). Service-role only now.
--
--  S1  push_subscriptions.business_id was CLIENT-ASSERTED. Any signed-in
--      user could tag their own device onto ANY business (via /subscribe
--      or direct PostgREST, RLS allowed it) and then receive that
--      business's announcements/offers/broadcast pushes. A DB-level guard
--      trigger now validates membership/staff-ship — it runs for the
--      service-role writes too, so it is the single enforcement point.
--
--  S1b Nothing removed push subscriptions when a member left a business —
--      ex-members kept receiving pushes forever. Cleanup trigger added.
--
--  Q2  fire_due_notifications() delivered queued check-in reminders to
--      users who had already left the business, and "you can check in
--      again" pings to users whose newer check-in meant they could NOT.
--      The drain now re-verifies membership and cooldown at fire time.
--
--  E1  notify_expiring_redemptions() was callable by any authenticated
--      user for any business (spam vector), and its 24h dedupe ignored
--      business_id — a reward-expiry notif from business A suppressed
--      business B's warning for the same user.
--
--  DUP1 Manager broadcasts and raffle-winner notifications were pushed
--      TWICE: once directly by the API route, then again ≤60s later by
--      the process-pending cron (their inserts never stamped
--      push_sent_at). Stamped at insert now.
--
--  NOTE (CP-93): notifications.kind CHECK constraint stays DROPPED.
--  Do not re-add it — raffle + queue kinds depend on that.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. (L1) Machine-only RPCs are machine-only.
-- ---------------------------------------------------------------------
-- NOTE: CREATE FUNCTION grants EXECUTE to PUBLIC by default, so revoking
-- only from authenticated/anon would leave the hole open through the
-- PUBLIC grant. All three revokes below include PUBLIC.
revoke execute on function public.list_pending_pushes(int) from public, authenticated, anon;
revoke execute on function public.mark_pushed(uuid[])      from public, authenticated, anon;
grant  execute on function public.list_pending_pushes(int) to service_role;
grant  execute on function public.mark_pushed(uuid[])      to service_role;

-- The queue drain is invoked by pg_cron / service role only.
revoke execute on function public.fire_due_notifications() from public, authenticated, anon;
grant  execute on function public.fire_due_notifications() to service_role;


-- ---------------------------------------------------------------------
-- 2. (S1) push_subscriptions guard — business tag must be earned.
-- ---------------------------------------------------------------------
-- A subscription may carry business_id = NULL (root/global, e.g. the
-- Field App) or a business the row's OWNER actually belongs to: an
-- enrolled member, business staff, or global agency staff. Validated
-- against the ROW's user_id (not auth.uid()) so it holds for service-role
-- writes from /api/notifications/subscribe as well as direct client ones.
create or replace function public._push_sub_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.business_id is null then
    return new;
  end if;
  -- Cheap skip on UPDATE when the tenant tag didn't move.
  if tg_op = 'UPDATE'
     and new.business_id is not distinct from old.business_id
     and new.user_id     is not distinct from old.user_id then
    return new;
  end if;

  if exists (select 1 from public.business_memberships m
              where m.user_id = new.user_id
                and m.business_id = new.business_id)
     or exists (select 1 from public.business_users u
                 where u.user_id = new.user_id
                   and (u.business_id = new.business_id
                        or (u.business_id is null
                            and u.role in ('agency_admin', 'agency_va'))))
  then
    return new;
  end if;

  raise exception 'push subscription rejected: user % is not a member or staff of business %',
    new.user_id, new.business_id
    using errcode = '42501';
end; $$;

drop trigger if exists trg_push_sub_guard on public.push_subscriptions;
create trigger trg_push_sub_guard
  before insert or update on public.push_subscriptions
  for each row execute function public._push_sub_guard();

-- Retro-audit: retag any EXISTING rows that violate the rule (tagged to a
-- business the owner doesn't belong to) down to NULL rather than deleting
-- the device outright. Expected to touch zero rows on a healthy DB.
update public.push_subscriptions s
   set business_id = null
 where s.business_id is not null
   and not exists (select 1 from public.business_memberships m
                    where m.user_id = s.user_id and m.business_id = s.business_id)
   and not exists (select 1 from public.business_users u
                    where u.user_id = s.user_id
                      and (u.business_id = s.business_id
                           or (u.business_id is null
                               and u.role in ('agency_admin', 'agency_va'))));


-- ---------------------------------------------------------------------
-- 3. (S1b) Leaving a business ends its pushes.
-- ---------------------------------------------------------------------
create or replace function public._push_sub_cleanup_on_leave()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.push_subscriptions s
   where s.user_id = old.user_id
     and s.business_id = old.business_id
     -- Staff keep their subscription even without a customer membership.
     and not exists (select 1 from public.business_users u
                      where u.user_id = old.user_id
                        and (u.business_id = old.business_id
                             or (u.business_id is null
                                 and u.role in ('agency_admin', 'agency_va'))));
  return old;
end; $$;

drop trigger if exists trg_push_sub_cleanup on public.business_memberships;
create trigger trg_push_sub_cleanup
  after delete on public.business_memberships
  for each row execute function public._push_sub_cleanup_on_leave();


-- ---------------------------------------------------------------------
-- 4. (Q2) Queue drain re-checks reality at fire time.
-- ---------------------------------------------------------------------
-- Same signature + FOR UPDATE SKIP LOCKED batching as CP-42, plus:
--   • a row whose membership no longer exists is RETIRED, not delivered
--     (user left / was removed / account deleted between enqueue + fire);
--   • kind = 'check_in_available' only delivers when the user's LATEST
--     check-in at that business is ≥ 12h old — i.e. the cooldown really
--     lapsed. A newer check-in (front-desk award, etc.) retires the row,
--     because "you can check in again" would be false.
-- Retired rows get fired_at stamped so the queue can never spin on them.
create or replace function public.fire_due_notifications()
returns int
language plpgsql security definer set search_path = public as $$
declare v_count int := 0;
begin
  with due as (
    select q.id, q.user_id, q.business_id, q.kind, q.title, q.body, q.link_path
      from public.notification_queue q
     where q.fired_at is null
       and q.fire_at <= now()
     limit 200
     for update skip locked
  ),
  deliverable as (
    select d.*
      from due d
     where exists (select 1 from public.business_memberships m
                    where m.user_id = d.user_id
                      and m.business_id = d.business_id)
       and (
         d.kind <> 'check_in_available'
         or not exists (
           select 1
             from public.check_in_events c
             join public.business_memberships m2 on m2.id = c.membership_id
            where m2.user_id = d.user_id
              and m2.business_id = d.business_id
              and c.created_at > now() - interval '12 hours'
         )
       )
  ),
  ins as (
    insert into public.notifications
      (user_id, business_id, kind, title, body, link_path)
    select user_id, business_id, kind, title, body, link_path
      from deliverable
    returning 1
  ),
  upd as (
    -- Delivered AND retired rows both leave the queue.
    update public.notification_queue
       set fired_at = now()
     where id in (select id from due)
    returning 1
  )
  select count(*) into v_count from ins;

  return v_count;
end; $$;
-- (grants already set in section 1)


-- ---------------------------------------------------------------------
-- 5. (E1) notify_expiring_redemptions — gated + business-scoped dedupe.
-- ---------------------------------------------------------------------
create or replace function public.notify_expiring_redemptions(p_business_id uuid)
returns int
language plpgsql security definer set search_path = public as $$
declare v_n int := 0;
begin
  -- Machine callers (pg_cron / service role) have no auth.uid(); a human
  -- caller must staff THIS business. Any authenticated user could
  -- previously invoke this for any business.
  if auth.uid() is not null and not public.staffs_business(p_business_id) then
    raise exception 'permission denied' using errcode = '42501';
  end if;

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
     and r.status = 'pending'
     and r.expires_at is not null
     and r.expires_at between now() and now() + interval '48 hours'
     and not exists (
       select 1 from public.notifications n
        where n.user_id = m.user_id
          -- CP-109: dedupe now scoped to THIS business. Business A's
          -- expiry notif no longer suppresses business B's for the
          -- same user.
          and n.business_id = r.business_id
          and n.kind = 'reward_expiration'
          and n.created_at > now() - interval '24 hours'
     );
  get diagnostics v_n = row_count;
  return v_n;
end; $$;
grant execute on function public.notify_expiring_redemptions(uuid) to authenticated, service_role;


-- ---------------------------------------------------------------------
-- 6. Queue enqueue is race-proof, not just check-then-insert.
-- ---------------------------------------------------------------------
-- Two concurrent check-ins could both pass the EXISTS test and double-
-- queue. Retire duplicate PENDING rows (keep the earliest), then enforce
-- with a partial unique index. ON CONFLICT isn't needed by the trigger —
-- it still does its EXISTS check first; the index is the backstop.
with dups as (
  select id, row_number() over (
           partition by user_id, dedupe_key order by created_at asc
         ) as rn
    from public.notification_queue
   where fired_at is null
)
update public.notification_queue q
   set fired_at = now()          -- retire, don't delete: keeps audit trail
  from dups
 where q.id = dups.id and dups.rn > 1;

create unique index if not exists notif_queue_pending_unique
  on public.notification_queue (user_id, dedupe_key)
  where fired_at is null;

-- Enqueue trigger now tolerates the unique backstop instead of erroring.
create or replace function public._queue_checkin_available_notif()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
  v_business uuid;
  v_business_name text;
  v_dedupe text;
  v_has_spin boolean;
begin
  select m.user_id, m.business_id, b.name
    into v_user, v_business, v_business_name
    from public.business_memberships m
    join public.businesses b on b.id = m.business_id
   where m.id = new.membership_id;
  if v_user is null then return new; end if;

  v_dedupe := 'checkin_avail:' || v_business::text;

  -- CP-109: a NEWER check-in should push the reminder OUT, not be
  -- swallowed. Refresh the pending row's fire_at to the new cooldown end
  -- (the old behavior skipped, leaving a reminder that fired while the
  -- user was still on cooldown).
  update public.notification_queue
     set fire_at = now() + interval '12 hours', created_at = now()
   where user_id = v_user and dedupe_key = v_dedupe and fired_at is null;
  if found then return new; end if;

  select coalesce(is_enabled, false) into v_has_spin
    from public.business_mystery_config
   where business_id = v_business;

  begin
    insert into public.notification_queue
      (fire_at, user_id, business_id, kind, title, body, link_path, dedupe_key)
    values (
      now() + interval '12 hours', v_user, v_business, 'check_in_available',
      case when v_has_spin
           then '🎰 Your spin is ready at ' || coalesce(v_business_name, 'your spot')
           else '✨ You can check in again'
      end,
      case when v_has_spin
           then 'Come back and spin for a surprise reward.'
           else 'Stop by and scan to keep your streak going.'
      end,
      '/app/scan',
      v_dedupe
    );
  exception when unique_violation then
    null;  -- concurrent enqueue lost the race; the surviving row wins
  end;

  return new;
end; $$;
-- (trigger trg_queue_checkin_avail already points at this function)


-- ---------------------------------------------------------------------
-- 7. (DUP1) Direct-pushed notifications never get re-pushed by the cron.
-- ---------------------------------------------------------------------
-- broadcast_notification: the /api/notifications/broadcast route sends
-- the push itself (sendPushToBusiness) right after calling this — so the
-- rows it inserts are stamped as already-pushed.
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

  insert into public.notifications
    (user_id, business_id, kind, title, body, link_path, push_sent_at)
  select m.user_id, p_business_id, p_kind, p_title, p_body, p_link_path, now()
    from public.business_memberships m
   where m.business_id = p_business_id;

  get diagnostics v_n = row_count;
  return v_n;
end; $$;
grant execute on function public.broadcast_notification(uuid, text, text, text, text) to authenticated;

-- Raffle winner + staff rows are pushed directly by /api/raffles/sweep in
-- the same pass that draws the winner. Stamp them at insert so the
-- process-pending cron can't push them a second time. (A stamp trigger
-- beats redefining the 200-line finalize functions — and keeps working if
-- those are ever re-applied from cp85.)
create or replace function public._notif_stamp_direct_push()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind in ('raffle_won', 'raffle_winner_drawn') and new.push_sent_at is null then
    new.push_sent_at := now();
  end if;
  return new;
end; $$;

drop trigger if exists trg_notif_stamp_direct_push on public.notifications;
create trigger trg_notif_stamp_direct_push
  before insert on public.notifications
  for each row execute function public._notif_stamp_direct_push();


-- ---------------------------------------------------------------------
-- 8. Supporting index for the business-scoped feed (cp44 functions).
-- ---------------------------------------------------------------------
create index if not exists notifications_user_business_recent
  on public.notifications (user_id, business_id, created_at desc);

-- Re-assert after every CREATE OR REPLACE above (C-O-R preserves ACLs, but
-- belt-and-braces in case sections are ever run piecemeal):
revoke execute on function public.fire_due_notifications() from public, authenticated, anon;
grant  execute on function public.fire_due_notifications() to service_role;

notify pgrst, 'reload schema';
