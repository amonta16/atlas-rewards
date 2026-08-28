-- =====================================================================
-- Atlas · CP-110 security-hardening regression suite
-- =====================================================================
-- Runs ENTIRELY inside a transaction that is ROLLED BACK — safe to run
-- against production in the Supabase SQL editor. Every assertion raises
-- (aborting with a clear message) on failure; reaching the final NOTICE
-- means all passed. Assumes cp110_security_hardening.sql is applied.
-- Impersonation uses the PostgREST pattern (set_config request.jwt.claims
-- + role); 'postgres' is Supabase's superuser used to reset between steps.
-- =====================================================================
-- CP-110 hardening test suite. Run AFTER shim + migration. Rolls back.
begin;
do $t$
declare
  uCust uuid := gen_random_uuid();
  uStaff uuid := gen_random_uuid();
  biz uuid; mem uuid; n int; bal int; ok boolean;
begin
  insert into auth.users(id,email) values (uCust,'c@x.test'),(uStaff,'s@x.test');
  insert into public.businesses(slug,name) values ('t','T') returning id into biz;
  insert into public.business_users(user_id,business_id,role) values (uStaff,biz,'business_manager');
  insert into public.business_memberships(user_id,business_id,points_balance,referral_code)
    values (uCust,biz,10,'ABC123') returning id into mem;
  insert into public.profiles(id,full_name,email,phone) values (uCust,'Cust','c@x.test','555');

  -- impersonate the customer
  perform set_config('request.jwt.claims', json_build_object('sub',uCust,'role','authenticated')::text, true);
  perform set_config('role','authenticated', true);

  -- T1: customer can READ own membership (mem_self SELECT still works)
  select count(*) into n from public.business_memberships where id=mem;
  if n<>1 then raise exception 'T1 FAIL: customer cannot read own membership (%)', n; end if;

  -- T2: customer can NO LONGER write own points_balance (mem_self is now SELECT-only)
  begin
    update public.business_memberships set points_balance=999999 where id=mem;
    -- if it "succeeds", RLS silently filtered 0 rows OR it wrote. Verify it did NOT change.
    perform set_config('role','postgres', true);
    select points_balance into bal from public.business_memberships where id=mem;
    if bal<>10 then raise exception 'T2 FAIL: customer rewrote points_balance to %', bal; end if;
    perform set_config('role','authenticated', true);
  exception when insufficient_privilege then
    perform set_config('role','authenticated', true);  -- also acceptable (hard deny)
  end;

  -- T3: customer cannot self-set paid status either
  perform set_config('role','postgres', true);
  select points_balance into bal from public.business_memberships where id=mem;
  perform set_config('role','authenticated', true);
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

  -- T5: resolve_member_by_code now refuses a non-staff caller
  begin
    perform * from public.resolve_member_by_code('ABC123', biz);
    raise exception 'T5 FAIL: non-staff read member PII via resolve_member_by_code';
  exception when insufficient_privilege then null;
  end;

  -- T6: staff CAN still resolve + CAN still update membership (mem_staff_write intact)
  perform set_config('request.jwt.claims', json_build_object('sub',uStaff,'role','authenticated')::text, true);
  select count(*) into n from public.resolve_member_by_code('ABC123', biz);
  if n<>1 then raise exception 'T6 FAIL: staff cannot resolve member (%)', n; end if;
  update public.business_memberships set points_balance=25 where id=mem;
  perform set_config('role','postgres', true);
  select points_balance into bal from public.business_memberships where id=mem;
  if bal<>25 then raise exception 'T6 FAIL: staff update did not apply (bal=%)', bal; end if;

  -- ── reverse_last_award: intervening REDEEM must not be clobbered ──
  -- balance 25. award +10 (snapshot balance_after=35), balance->35.
  insert into public.points_ledger(membership_id,business_id,delta,rule_type,balance_after,created_at)
    values (mem,biz,10,'award',35, now() - interval '5 min');
  update public.business_memberships set points_balance=35 where id=mem;
  -- customer then REDEEMS -8 (balance 35->27). This is the intervening change.
  insert into public.points_ledger(membership_id,business_id,delta,rule_type,balance_after,created_at)
    values (mem,biz,-8,'redeem',27, now() - interval '1 min');
  update public.business_memberships set points_balance=27 where id=mem;
  -- now undo the +10 (most recent POSITIVE entry).
  --   buggy: uses the award's stale balance_after(35) -> 35-10 = 25 (redeem lost)
  --   fixed: adjusts from current balance      -> 27-10 = 17 (redeem preserved)
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
