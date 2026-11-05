-- CP-231: Shop orders earn points when they're paid.
-- NOT APPLIED YET as of 2026-11-05: run once in the Supabase SQL Editor, BEFORE pushing the app change.
--
-- Fires on the order's move to 'paid', so it covers both ways an order gets
-- paid: the Stripe webhook (no signed-in user, so award_points would refuse it)
-- and "Mark paid" at the desk. Rate = businesses.point_rules.purchase_per_dollar.
--
-- · Once per order: idempotency key shop_order_<id> is UNIQUE on points_ledger.
-- · Not a visit: visit_count and last_visit_at stay put, and created_by is null
--   so _auto_checkin_on_award skips it.
-- · No points on gift cards: the points come when the card is spent.
-- · Never blocks a payment: any error here is a warning, the order still saves.
-- · Refunds don't take points back automatically: use Remove points at the desk.
--
-- Undo: drop trigger trg_medspa_order_points on public.medspa_shop_orders;

create or replace function public._medspa_award_order_points()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_rate    numeric;
  v_points  integer;
  v_member  uuid;
  v_balance integer;
  v_ledger  uuid;
begin
  begin
    if new.kind = 'gift_card' or new.user_id is null then return new; end if;

    select coalesce(nullif(point_rules->>'purchase_per_dollar', '')::numeric, 1)
      into v_rate from public.businesses where id = new.business_id;
    v_points := floor((new.amount_cents / 100.0) * coalesce(v_rate, 0));
    if v_points <= 0 then return new; end if;

    select id, points_balance into v_member, v_balance
      from public.business_memberships
     where business_id = new.business_id and user_id = new.user_id
     for update;
    if v_member is null then return new; end if;

    insert into public.points_ledger
      (membership_id, business_id, delta, rule_type, reference_id, idempotency_key, balance_after, notes, created_by)
    values
      (v_member, new.business_id, v_points, 'purchase', new.id, 'shop_order_' || new.id::text, v_balance + v_points, new.item_name, null)
    on conflict (idempotency_key) do nothing
    returning id into v_ledger;
    if v_ledger is null then return new; end if; -- already credited

    update public.business_memberships
       set points_balance = points_balance + v_points,
           lifetime_points_earned = lifetime_points_earned + v_points,
           updated_at = now()
     where id = v_member;
  exception when others then
    raise warning 'shop order % points failed: %', new.id, sqlerrm;
  end;
  return new;
end $$;

revoke all on function public._medspa_award_order_points() from public, anon, authenticated;

drop trigger if exists trg_medspa_order_points on public.medspa_shop_orders;
create trigger trg_medspa_order_points
  after update of status on public.medspa_shop_orders
  for each row
  when (new.status = 'paid' and old.status is distinct from 'paid')
  execute function public._medspa_award_order_points();
