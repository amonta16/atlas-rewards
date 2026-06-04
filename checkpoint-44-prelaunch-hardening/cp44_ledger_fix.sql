-- =====================================================================
-- CP-44.1 — points_ledger: stop rejecting valid point awards
-- =====================================================================
-- Two long-standing landmines surfaced when the daily spin + streak
-- milestones tried to credit points:
--
--   1. rule_type CHECK constraint. The original enum (review, visit,
--      purchase, milestone, ...) never included the rule_types the app
--      actually writes from newer features — 'mystery_bonus' (daily
--      spin), 'streak_milestone' (streak), 'winback', etc. Every such
--      insert failed: "violates check constraint
--      points_ledger_rule_type_check". rule_type is set ONLY by
--      server-side SECURITY DEFINER RPCs, so the enum adds no real
--      safety — it just blocks legitimate credits. We drop it.
--
--   2. balance_after is NOT NULL with no default, but the streak
--      milestone insert (get_streak_status) never supplied it, so even
--      with rule_type fixed it would fail. We make it nullable and
--      auto-fill it from the member's balance when an insert omits it.
--
-- Idempotent — safe to re-run.
-- =====================================================================

-- 1. Drop the brittle rule_type enum guard.
alter table public.points_ledger
  drop constraint if exists points_ledger_rule_type_check;

-- 2. Auto-fill balance_after when an insert leaves it null.
alter table public.points_ledger
  alter column balance_after drop not null;

create or replace function public.points_ledger_fill_balance()
returns trigger
language plpgsql
as $$
begin
  if new.balance_after is null then
    -- Member balance is updated alongside the ledger insert; this row's
    -- running balance is the current stored balance plus this delta.
    new.balance_after := coalesce(
      (select points_balance
         from public.business_memberships
        where id = new.membership_id), 0
    ) + coalesce(new.delta, 0);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_points_ledger_fill_balance on public.points_ledger;
create trigger trg_points_ledger_fill_balance
  before insert on public.points_ledger
  for each row
  execute function public.points_ledger_fill_balance();

notify pgrst, 'reload schema';
