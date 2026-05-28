-- =====================================================================
-- CHECKPOINT 4 — Enable Supabase Realtime + helper RPC for quick-award
-- =====================================================================

-- Allow Supabase Realtime to broadcast changes on these tables.
-- The customer app subscribes to its own rows (RLS still filters — a
-- customer only receives events for THEIR membership / ledger entries).
alter publication supabase_realtime add table public.business_memberships;
alter publication supabase_realtime add table public.points_ledger;

-- Allow REPLICA IDENTITY FULL so UPDATE events include all column values
-- (otherwise we only get the changed columns and have to refetch).
alter table public.business_memberships replica identity full;
alter table public.points_ledger        replica identity full;

-- =====================================================================
-- Quick-award helper: award points for a non-purchase rule (review,
-- referral, birthday, visit, etc.). The manager UI calls this — uses
-- the business's configured point value for that rule.
-- =====================================================================
create or replace function public.quick_award(
  p_membership_id  uuid,
  p_rule_key       text,
  p_notes          text default null
)
returns table (ledger_id uuid, new_balance integer, points_awarded integer)
language plpgsql security definer set search_path = public as $$
declare
  v_business_id  uuid;
  v_rule_value   integer;
  v_result       record;
begin
  -- Lookup the business + the configured point value for this rule
  select m.business_id,
         coalesce((b.point_rules->>p_rule_key)::int, 0)
    into v_business_id, v_rule_value
    from public.business_memberships m
    join public.businesses b on b.id = m.business_id
   where m.id = p_membership_id;

  if v_business_id is null then
    raise exception 'membership % not found', p_membership_id;
  end if;

  if v_rule_value <= 0 then
    raise exception 'rule "%" is set to 0 points for this business — edit it in the brand editor first', p_rule_key;
  end if;

  -- Auth gate: must be staff of this business
  if not public.staffs_business(v_business_id) then
    raise exception 'permission denied: not authorized to award points for this business';
  end if;

  -- Award via the existing engine
  select * into v_result from public.award_points(
    p_membership_id,
    v_rule_value,
    p_rule_key,
    null,
    'quick_award_' || p_membership_id || '_' || p_rule_key || '_' || extract(epoch from now())::text,
    coalesce(p_notes, p_rule_key || ' reward')
  );

  return query select v_result.ledger_id, v_result.new_balance, v_rule_value;
end; $$;

grant execute on function public.quick_award(uuid, text, text) to authenticated;
