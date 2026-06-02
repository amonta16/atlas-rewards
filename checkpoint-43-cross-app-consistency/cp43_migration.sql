-- =====================================================================
-- CP-43 — Cross-app consistency fixes
-- =====================================================================
-- Apply in the Supabase SQL editor (or via the CLI). Idempotent — safe
-- to re-run. Two functions:
--
--   1. business_recent_activity   — front-desk activity log with real
--      member names (fixes the "Guest" rows). SECURITY DEFINER so the
--      name join isn't blocked by per-row RLS on profiles, gated to any
--      staff/manager/admin of the business.
--
--   2. manager_remove_points      — lets managers + front-desk deduct
--      points from a member (corrections, refunds, abuse). Mirrors the
--      award path, clamps at zero, and writes an auditable ledger row.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Recent activity with member names (fixes "Guest")
-- ---------------------------------------------------------------------
-- The manager page was joining points_ledger → business_memberships →
-- profiles from the client, which RLS silently trimmed to nothing for
-- front-desk (business_staff) viewers — so every row showed "Guest".
-- This SECURITY DEFINER function does the join server-side and is gated
-- to people who actually work at the business.
create or replace function public.business_recent_activity(
  p_business_id uuid,
  p_limit       integer default 20
)
returns table (
  id            uuid,
  delta         integer,
  rule_type     text,
  notes         text,
  created_at    timestamptz,
  membership_id uuid,
  customer_name text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Authorization: caller must be staff, manager, or agency admin for
  -- this business. current_app_role returns one of those strings (or
  -- 'customer' / null otherwise).
  if public.current_app_role(p_business_id)
       not in ('agency_admin', 'business_manager', 'business_staff') then
    raise exception 'not authorized for business %', p_business_id
      using errcode = '42501';
  end if;

  return query
    select
      l.id,
      l.delta,
      l.rule_type,
      l.notes,
      l.created_at,
      l.membership_id,
      coalesce(
        nullif(btrim(p.full_name), ''),
        p.email,
        'Guest'
      ) as customer_name
    from public.points_ledger l
    left join public.business_memberships m on m.id = l.membership_id
    left join public.profiles p             on p.id = m.user_id
    where l.business_id = p_business_id
    order by l.created_at desc
    limit greatest(1, least(coalesce(p_limit, 20), 100));
end;
$$;

grant execute on function public.business_recent_activity(uuid, integer)
  to authenticated;

-- ---------------------------------------------------------------------
-- 2. Manager / front-desk point removal
-- ---------------------------------------------------------------------
-- Deducts points from a member with a reason. Gated to staff/manager/
-- admin of the business, clamps so the balance can never go negative,
-- and writes a ledger row (rule_type 'manual_removal') so the deduction
-- shows up in the activity log just like an award.
create or replace function public.manager_remove_points(
  p_membership_id uuid,
  p_amount        integer,       -- positive number of points to remove
  p_notes         text default null
)
returns table (ledger_id uuid, new_balance integer, removed integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_balance     integer;
  v_remove      integer;
  v_new_balance integer;
  v_ledger_id   uuid;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount to remove must be a positive integer';
  end if;

  -- Lock the membership row + read current balance.
  select business_id, points_balance
    into v_business_id, v_balance
    from public.business_memberships
   where id = p_membership_id
   for update;

  if v_business_id is null then
    raise exception 'membership % not found', p_membership_id;
  end if;

  -- Authorization against the membership's own business.
  if public.current_app_role(v_business_id)
       not in ('agency_admin', 'business_manager', 'business_staff') then
    raise exception 'not authorized for business %', v_business_id
      using errcode = '42501';
  end if;

  -- Clamp: never remove more than the member has.
  v_remove      := least(p_amount, v_balance);
  v_new_balance := v_balance - v_remove;

  update public.business_memberships
     set points_balance = v_new_balance,
         updated_at      = now()
   where id = p_membership_id;

  insert into public.points_ledger
    (membership_id, business_id, delta, rule_type, balance_after, notes, created_by)
  values
    (p_membership_id, v_business_id, -v_remove, 'manual_removal',
     v_new_balance, coalesce(p_notes, 'Manual point removal'), auth.uid())
  returning id into v_ledger_id;

  perform public.recalc_tier(p_membership_id);

  return query select v_ledger_id, v_new_balance, v_remove;
end;
$$;

grant execute on function public.manager_remove_points(uuid, integer, text)
  to authenticated;
