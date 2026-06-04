-- =====================================================================
-- CP-44 — Pre-launch security & isolation hardening
-- =====================================================================
-- Idempotent. Apply in the Supabase SQL editor.
--
-- 1. Scope the in-app notification feed to ONE business, so a customer
--    who belongs to two Atlas businesses never sees business B's
--    notifications inside business A's app (and vice-versa).
-- 2. Lock down notification_queue (the only table found without RLS).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Business-scoped notification feed
-- ---------------------------------------------------------------------
-- Drop the old no-arg / single-arg versions so adding a defaulted
-- p_business_id doesn't create an ambiguous overload.
drop function if exists public.list_notifications(int);
drop function if exists public.unread_notification_count();
drop function if exists public.mark_all_notifications_read();

-- All three now take an optional p_business_id. NULL keeps the old
-- "everything for this user" behavior (back-compat); a value scopes to
-- that business only. RLS still guarantees user_id = auth.uid().
create or replace function public.list_notifications(
  p_limit int default 50,
  p_business_id uuid default null
)
returns table (
  id uuid, kind text, title text, body text, link_path text,
  read_at timestamptz, created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select id, kind, title, body, link_path, read_at, created_at
    from public.notifications
   where user_id = auth.uid()
     and (p_business_id is null or business_id = p_business_id)
   order by created_at desc
   limit greatest(1, least(p_limit, 200));
$$;
grant execute on function public.list_notifications(int, uuid) to authenticated;

create or replace function public.unread_notification_count(
  p_business_id uuid default null
)
returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int
    from public.notifications
   where user_id = auth.uid()
     and read_at is null
     and (p_business_id is null or business_id = p_business_id);
$$;
grant execute on function public.unread_notification_count(uuid) to authenticated;

create or replace function public.mark_all_notifications_read(
  p_business_id uuid default null
)
returns int
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  update public.notifications
     set read_at = now()
   where user_id = auth.uid()
     and read_at is null
     and (p_business_id is null or business_id = p_business_id);
  get diagnostics v_n = row_count;
  return v_n;
end; $$;
grant execute on function public.mark_all_notifications_read(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Lock down notification_queue (was the only table without RLS)
-- ---------------------------------------------------------------------
-- It's written/read only by SECURITY DEFINER functions + the service-role
-- cron, both of which BYPASS RLS. So enabling RLS with NO client policy
-- simply denies all direct REST access from anon/authenticated users —
-- closing the hole without breaking the server-side pipeline.
alter table public.notification_queue enable row level security;
-- (No policy intentionally = deny all to anon/authenticated.)
revoke all on public.notification_queue from anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Front-desk scan shows the reward's IMAGE
-- ---------------------------------------------------------------------
-- resolve_redemption_by_code didn't return the reward photo, so the
-- fulfillment screen could only show a generic gift icon. Add image_url
-- so staff see the actual item when they scan a redemption code.
drop function if exists public.resolve_redemption_by_code(text, uuid);
create or replace function public.resolve_redemption_by_code(p_code text, p_business_id uuid)
returns table (
  redemption_id uuid, reward_id uuid, membership_id uuid,
  reward_name text, reward_description text, reward_type text,
  reward_image_url text,
  point_cost integer, status text, code text,
  member_name text, member_email text,
  created_at timestamptz, expires_at timestamptz, fulfilled_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select r.id, r.reward_id, r.membership_id,
         rw.name, rw.description, rw.reward_type,
         rw.image_url,
         r.point_cost, r.status, r.code,
         p.full_name, p.email,
         r.created_at, r.expires_at, r.fulfilled_at
    from public.redemptions r
    join public.rewards rw             on rw.id = r.reward_id
    join public.business_memberships m on m.id = r.membership_id
    join public.profiles p             on p.id = m.user_id
   where r.code = upper(p_code) and r.business_id = p_business_id
   limit 1;
$$;
grant execute on function public.resolve_redemption_by_code(text, uuid) to authenticated;

notify pgrst, 'reload schema';
