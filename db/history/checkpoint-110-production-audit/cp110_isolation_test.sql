-- =====================================================================
-- Atlas · CP-110 security-hardening regression suite
-- =====================================================================
-- Runs ENTIRELY inside a transaction that is ROLLED BACK — safe to run
-- against production in the Supabase SQL editor. Every assertion raises
-- (aborting with a clear message) on failure; reaching the final NOTICE
-- means all passed. Assumes cp110_security_hardening.sql is applied.
--
-- Impersonation uses the PostgREST pattern (set_config request.jwt.claims
-- + role); 'postgres' is Supabase's SQL-editor role, used to reset
-- between steps. All test rows are synthetic and rolled back.
--
-- Robust against the live schema: the profiles row is auto-created by the
-- handle_new_user trigger, so we UPSERT it; the referral code is read
-- back from the membership (in case a trigger sets it); ledger rows use
-- real rule_type values and unique idempotency keys.
-- =====================================================================
begin;
do $t$
declare
  uCust uuid := gen_random_uuid();
  uStaff uuid := gen_random_uuid();
  biz uuid; mem uuid; n int; bal int; v_code text;
begin
  -- Seed two users. The handle_new_user trigger creates their profiles.
  insert into auth.users(id,email) values
    (uCust,  uCust::text  || '@cp110.test'),
    (uStaff, uStaff::text || '@cp110.test');

  insert into public.businesses(slug,name)
    values ('cp110-' || substr(replace(uCust::text,'-',''),1,10), 'CP110 Test')
    returning id into biz;

  insert into public.business_users(user_id,business_id,role)
    values (uStaff,biz,'business_manager');

  insert into public.business_memberships(user_id,business_id,points_balance)
    values (uCust,biz,10) returning id into mem;

  -- Ensure the member has a referral code, then read back the real value.
  select referral_code into v_code from public.business_memberships where id=mem;
  if v_code is null then
    v_code := 'ZZ' || upper(substr(replace(mem::text,'-',''),1,6));
    update public.business_memberships set referral_code=v_code where id=mem;
  end if;

  -- Fill in the profile the trigger created (name used by resolve test).
  insert into public.profiles(id,full_name,email,phone)
    values (uCust,'CP110 Cust', uCust::text || '@cp110.test','5555550000')
    on conflict (id) do update
      set full_name=excluded.full_name, email=excluded.email, phone=excluded.phone;

  -- ── impersonate the customer ──────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub',uCust,'role','authenticated')::text, true);
  perform set_config('role','authenticated', true);

  -- T1: customer can READ own membership (mem_self SELECT still works)
  select count(*) into n from public.business_memberships where id=mem;
  if n<>1 then raise exception 'T1 FAIL: customer cannot read own membership (%)', n; end if;

  -- T2: customer can NO LONGER write own points_balance (mem_self is SELECT-only)
  begin
    update public.business_memberships set points_balance=999999 where id=mem;
    perform set_config('role','postgres', true);
    select points_balance into bal from public.business_memberships where id=mem;
    if bal<>10 then raise exception 'T2 FAIL: customer rewrote points_balance to %', bal; end if;
    perform set_config('role','authenticated', true);
  exception when insufficient_privilege then
    perform set_config('role','authenticated', true);   -- hard-deny is also acceptable
  end;

  -- T3: customer cannot self-set paid membership status
  update public.business_memberships set membership_payment_status='paid' where id=mem;
  perform set_config('role','postgres', true);
  select count(*) into n from public.business_memberships where id=mem and membership_payment_status='paid';
  if n<>0 then raise exception 'T3 FAIL: customer self-granted paid membership'; end if;
  perform set_config('role','authenticated', true);

  -- T4: bootstrap RPC now dead to authenticated
  begin
    perform public.bootstrap_self_agency_admin(true);
    raise exception 'T4 FAIL: authenticated can still self-bootstrap agency admin';
  exception when insufficient_privilege then null;
  end;

  -- T5: resolve_member_by_code refuses a non-staff caller
  begin
    perform * from public.resolve_member_by_code(v_code, biz);
    raise exception 'T5 FAIL: non-staff read member PII via resolve_member_by_code';
  exception when insufficient_privilege then null;
  end;

  -- T6: staff CAN resolve + CAN update the membership (mem_staff_write intact)
  perform set_config('request.jwt.claims', json_build_object('sub',uStaff,'role','authenticated')::text, true);
  select count(*) into n from public.resolve_member_by_code(v_code, biz);
  if n<>1 then raise exception 'T6 FAIL: staff cannot resolve member (%)', n; end if;
  update public.business_memberships set points_balance=25 where id=mem;
  perform set_config('role','postgres', true);
  select points_balance into bal from public.business_memberships where id=mem;
  if bal<>25 then raise exception 'T6 FAIL: staff update did not apply (bal=%)', bal; end if;

  -- ── reverse_last_award: an intervening REDEEM must not be clobbered ──
  -- balance 25. award +10 (snapshot balance_after=35), balance->35.
  insert into public.points_ledger(membership_id,business_id,delta,rule_type,balance_after,idempotency_key,created_at)
    values (mem,biz,10,'visit',35,'cp110-award-'||mem::text, now() - interval '5 min');
  update public.business_memberships set points_balance=35 where id=mem;
  -- customer then REDEEMS -8 (balance 35->27). This is the intervening change.
  insert into public.points_ledger(membership_id,business_id,delta,rule_type,balance_after,idempotency_key,created_at)
    values (mem,biz,-8,'redemption',27,'cp110-redeem-'||mem::text, now() - interval '1 min');
  update public.business_memberships set points_balance=27 where id=mem;
  -- now undo the +10 (most recent POSITIVE entry).
  --   buggy: uses the award's stale balance_after(35) -> 35-10 = 25 (redeem lost)
  --   fixed: adjusts from current balance       -> 27-10 = 17 (redeem preserved)
  perform set_config('request.jwt.claims', json_build_object('sub',uStaff,'role','authenticated')::text, true);
  perform set_config('role','authenticated', true);
  perform public.reverse_last_award(biz, mem, 3600);
  perform set_config('role','postgres', true);
  select points_balance into bal from public.business_memberships where id=mem;
  if bal<>17 then raise exception 'T7 FAIL: reverse clobbered intervening redeem (bal=% expected 17)', bal; end if;

  -- T8: undoing the SAME award twice is refused (idempotent, no double-decrement)
  perform set_config('role','authenticated', true);
  begin
    perform public.reverse_last_award(biz, mem, 3600);
    raise exception 'T8 FAIL: same award was undone twice';
  exception
    when others then
      if sqlerrm like '%already undone%' then null;   -- expected
      else raise; end if;
  end;
  perform set_config('role','postgres', true);
  select points_balance into bal from public.business_memberships where id=mem;
  if bal <> 17 then raise exception 'T8 FAIL: balance moved after refused double-undo (%)', bal; end if;

  raise notice '✅ ALL CP-110 HARDENING TESTS PASSED (final balance=%)', bal;
end;
$t$;
rollback;
