-- =====================================================================
-- CP-44 — Common loophole fixes (point-manipulation)
-- =====================================================================
-- Apply in the Supabase SQL editor. Idempotent.
--
-- CRITICAL: award_points was granted to `authenticated` with NO staff
-- check, so a logged-in CUSTOMER could call it directly via the API and
-- award themselves (or anyone) unlimited points. Every other point-
-- granting RPC (quick_award, member_checkin, send_winback,
-- manager_remove_points) already gates on staffs_business(); award_points
-- was the one gap. This adds the same gate.
--
-- Safe to add: award_points is only ever called by the front-desk panel
-- (staff) and internally by quick_award (itself already staff-gated), so
-- the guard passes for all legitimate callers and only blocks the exploit.
-- =====================================================================

create or replace function public.award_points(
  p_membership_id  uuid,
  p_delta          integer,
  p_rule_type      text,
  p_reference_id   uuid default null,
  p_idempotency_key text default null,
  p_notes          text default null
)
returns table (ledger_id uuid, new_balance integer)
language plpgsql security definer set search_path = public as $$
declare
  v_business_id  uuid;
  v_new_balance  integer;
  v_ledger_id    uuid;
  v_existing_id  uuid;
  v_member_biz   uuid;
begin
  -- ── Auth gate (CP-44) ──────────────────────────────────────────────
  -- Resolve the membership's business + owner. Allow the call only if:
  --   • the caller STAFFS this business (front-desk award/remove), OR
  --   • the caller is the member AND this is a DEDUCTION (p_delta < 0) —
  --     i.e. their own redemption spending points they already have.
  -- This blocks the exploit (a customer self-AWARDING positive points via
  -- a direct API call) while keeping redeem_reward working. The existing
  -- "balance can't go negative" check still guards over-spending.
  declare v_owner uuid;
  begin
    select business_id, user_id into v_member_biz, v_owner
      from public.business_memberships where id = p_membership_id;
    if v_member_biz is null then
      raise exception 'membership % not found', p_membership_id;
    end if;
    if not (
      public.staffs_business(v_member_biz)
      or (p_delta < 0 and v_owner = auth.uid())
    ) then
      raise exception 'permission denied: cannot award points here'
        using errcode = '42501';
    end if;
  end;

  -- Idempotency short-circuit
  if p_idempotency_key is not null then
    select id into v_existing_id from public.points_ledger where idempotency_key = p_idempotency_key;
    if v_existing_id is not null then
      return query
        select l.id, m.points_balance
          from public.points_ledger l
          join public.business_memberships m on m.id = l.membership_id
         where l.id = v_existing_id;
      return;
    end if;
  end if;

  -- Lock the membership row to serialize concurrent awards
  select business_id, points_balance + p_delta
    into v_business_id, v_new_balance
    from public.business_memberships
   where id = p_membership_id
   for update;

  if v_new_balance < 0 then
    raise exception 'insufficient points (would go to %)', v_new_balance;
  end if;

  update public.business_memberships
     set points_balance = v_new_balance,
         lifetime_points_earned = lifetime_points_earned + greatest(p_delta, 0),
         updated_at = now()
   where id = p_membership_id;

  insert into public.points_ledger
    (membership_id, business_id, delta, rule_type, reference_id, idempotency_key, balance_after, notes, created_by)
  values
    (p_membership_id, v_business_id, p_delta, p_rule_type, p_reference_id, p_idempotency_key, v_new_balance, p_notes, auth.uid())
  returning id into v_ledger_id;

  perform public.recalc_tier(p_membership_id);

  return query select v_ledger_id, v_new_balance;
end; $$;

grant execute on function public.award_points(uuid,integer,text,uuid,text,text) to authenticated;

notify pgrst, 'reload schema';
