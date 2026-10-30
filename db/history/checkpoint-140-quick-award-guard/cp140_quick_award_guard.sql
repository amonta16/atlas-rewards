-- CP-140 · quick_award() double-tap guard
--
-- Idempotent. Safe to re-run.
--
-- THE BUG
-- award_points() short-circuits on points_ledger.idempotency_key, which carries
-- a global UNIQUE index (points_ledger_idempotency_key_key). quick_award built
-- that key with extract(epoch from now()) -- microsecond precision, a fresh
-- transaction per RPC call -- so the key was unique on EVERY call and the
-- short-circuit could never match. The protection was dead code on this path.
--
-- WHY NOT JUST DROP THE TIMESTAMP
-- The unique index is global, not scoped per member or per day. A static key
-- ('quick_award_<membership>_<rule>') would insert once and then early-return
-- forever: each member would earn each rule exactly once in their lifetime at
-- that shop, silently, with staff still seeing a success message.
--
-- THE FIX
-- Guard on recency instead of on the key. If the same rule was already awarded
-- to this membership within the last 5 seconds, return that ledger row and
-- award nothing. Covers a double-tap and a counter-wifi retry without blocking
-- genuinely separate activity. Rides ledger_membership_idx
-- (membership_id, created_at DESC).
--
-- points_awarded returns 0 on the deduped path so the caller can distinguish a
-- real award from a swallowed repeat. new_balance is the true current balance.

CREATE OR REPLACE FUNCTION public.quick_award(
  p_membership_id uuid,
  p_rule_key text,
  p_notes text DEFAULT NULL::text
)
RETURNS TABLE(ledger_id uuid, new_balance integer, points_awarded integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_business_id  uuid;
  v_rule_value   integer;
  v_result       record;
  v_recent_id    uuid;
  v_balance      integer;
begin
  select m.business_id,
         coalesce((b.point_rules->>p_rule_key)::int, 0)
    into v_business_id, v_rule_value
    from public.business_memberships m
    join public.businesses b on b.id = m.business_id
   where m.id = p_membership_id;
  if v_business_id is null then raise exception 'membership not found'; end if;
  if v_rule_value <= 0 then raise exception 'rule "%" is set to 0 points', p_rule_key; end if;
  if not public.staffs_business(v_business_id) then raise exception 'permission denied'; end if;

  -- CP-140: double-tap / retry guard (see header).
  select l.id, m.points_balance
    into v_recent_id, v_balance
    from public.points_ledger l
    join public.business_memberships m on m.id = l.membership_id
   where l.membership_id = p_membership_id
     and l.rule_type = p_rule_key
     and l.created_at > now() - interval '5 seconds'
   order by l.created_at desc
   limit 1;

  if v_recent_id is not null then
    return query select v_recent_id, v_balance, 0;
    return;
  end if;

  select * into v_result from public.award_points(
    p_membership_id, v_rule_value, p_rule_key, null,
    'quick_award_' || p_membership_id || '_' || p_rule_key || '_' || extract(epoch from now())::text,
    coalesce(p_notes, p_rule_key || ' reward')
  );
  return query select v_result.ledger_id, v_result.new_balance, v_rule_value;
end; $function$;
