-- =====================================================================
-- Atlas · CP-122 — reward-unlocked notifications: visible rewards only,
--                  and exactly ONE push per award
-- =====================================================================
-- SYMPTOM: crossing a points threshold fired "Reward unlocked!" pushes
-- for HIDDEN rewards too — prize-wheel-only and streak-gift rewards
-- (show_in_store = false, CP-87) that can't be redeemed from the store —
-- and the same award could buzz the phone several times.
--
-- WHY: the CP-42 trigger `_notif_reward_unlocked` predates CP-87's
-- show_in_store flag (never filtered it) and inserts UNSTAMPED rows,
-- which the per-minute cron then pushes — on top of the ONE aggregated
-- push the desk's award-event route already sends (which DOES filter
-- hidden rewards, CP-87).
--
-- FIX:
--   · The trigger now skips rewards that aren't store-visible.
--   · Its rows are stamped push_sent_at at insert = BELL-ONLY. The
--     aggregated award-event push is the one phone buzz per award
--     (its own row is now stamped too, app-side, same checkpoint).
--     Balance bumps that happen inside the app (streak-gift claims,
--     wheel wins) still write bell rows — no push needed, the customer
--     is already looking at the screen.
--
-- Safe to run on production, re-runnable.
-- =====================================================================

begin;

create or replace function public._notif_reward_unlocked()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r       record;
  v_name  text;
begin
  -- Only fire when balance went UP.
  if new.points_balance <= old.points_balance then return new; end if;

  select name into v_name from public.businesses where id = new.business_id;

  -- One BELL row per store-visible reward whose threshold was just
  -- crossed. CP-122: hidden rewards (prize wheel / streak gifts,
  -- show_in_store = false) are excluded — they can't be redeemed from
  -- the store, so "you can now redeem X" was a lie. Rows are stamped
  -- push_sent_at so the cron never pushes them: the desk's aggregated
  -- award-event push is the single phone notification per award.
  for r in
    select id, name, point_cost
      from public.rewards
     where business_id = new.business_id
       and is_active = true
       and coalesce(show_in_store, true) = true
       and point_cost <= new.points_balance
       and point_cost >  old.points_balance
  loop
    insert into public.notifications
      (user_id, business_id, kind, title, body, link_path, push_sent_at)
    values
      (new.user_id, new.business_id, 'reward_unlocked',
       'Reward unlocked! 🎁',
       'You can now redeem ' || r.name || ' at ' || coalesce(v_name, 'your spot') || '.',
       '/app/rewards',
       now());
  end loop;

  return new;
end; $$;

drop trigger if exists trg_notif_reward_unlocked on public.business_memberships;
create trigger trg_notif_reward_unlocked
  after update of points_balance on public.business_memberships
  for each row
  when (new.points_balance > old.points_balance)
  execute function public._notif_reward_unlocked();

commit;

notify pgrst, 'reload schema';

-- =====================================================================
-- After applying + deploying: awarding points that cross a HIDDEN
-- reward's threshold produces nothing; crossing visible rewards
-- produces bell rows + exactly ONE aggregated push from the desk.
-- =====================================================================
