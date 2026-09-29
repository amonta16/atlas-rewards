-- CP-174: Undo on a desk social/review award must also release the once-per-member lock.
-- Bug: reverse_last_award() reversed the points but left the `reviews` row 'verified',
-- so the tile kept saying "Earned" and desk_award_social() returned already=true / 0 pts
-- forever (Kristin DeJong, 2026-09-28: +1000 at 18:14:57, Undo at 18:15:03, no way to re-award).
-- Fix: when the reversed ledger row is a review / social_follow award, mark its reviews row
-- 'rejected' (not deleted -> audit trail kept). Existing lookups only consider
-- pending/verified, so the next desk tap inserts a fresh row and a fresh idempotency key.
create or replace function public.reverse_last_award(
  p_business_id uuid, p_membership_id uuid, p_within_seconds integer default 60)
returns table(reversed_ledger_id uuid, delta integer)
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_row     record;
  v_new_id  uuid;
  v_cur_bal integer;
  v_new_bal integer;
begin
  if not public.staffs_business(p_business_id) then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  select points_balance into v_cur_bal
    from public.business_memberships where id = p_membership_id for update;
  if v_cur_bal is null then raise exception 'membership not found'; end if;

  select pl.id, pl.delta, pl.rule_type, pl.reference_id into v_row
    from public.points_ledger pl
   where pl.business_id = p_business_id and pl.membership_id = p_membership_id
     and pl.delta > 0 and pl.rule_type <> 'reversal'
     and pl.created_at > now() - make_interval(secs => p_within_seconds)
   order by pl.created_at desc limit 1;
  if v_row is null then raise exception 'no recent positive ledger entry to reverse'; end if;

  if exists (select 1 from public.points_ledger where idempotency_key = 'rev-' || v_row.id::text) then
    raise exception 'that award was already undone';
  end if;

  v_new_bal := greatest(0, v_cur_bal - v_row.delta);

  insert into public.points_ledger
    (membership_id, business_id, delta, rule_type, reference_id, idempotency_key, balance_after)
  values
    (p_membership_id, p_business_id, -v_row.delta, 'reversal', v_row.id, 'rev-' || v_row.id::text, v_new_bal);
  v_new_id := (select id from public.points_ledger where idempotency_key = 'rev-' || v_row.id::text);

  update public.business_memberships set points_balance = v_new_bal where id = p_membership_id;

  -- CP-174: release the once-per-member social/review lock.
  if v_row.rule_type in ('review', 'social_follow') and v_row.reference_id is not null then
    update public.reviews
       set status = 'rejected'
     where id = v_row.reference_id
       and membership_id = p_membership_id
       and status = 'verified';
  end if;

  return query select v_new_id, -v_row.delta;
end; $function$;
