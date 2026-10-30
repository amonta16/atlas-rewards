-- =====================================================================
-- CP-44 — Seed a standard Daily Spin pool (50 / 100 / 300 points)
-- =====================================================================
-- Enables the daily spin for ONE business and adds three weighted
-- points prizes (the same 80% / 15% / 5% odds the old client used).
-- Run once per business; safe to re-run (won't duplicate the pool).
--
-- 👉 Change 'demo' to the business slug you want, then run.
-- To do it for EVERY business at once, see the second block at the bottom.
-- =====================================================================

do $$
declare v_biz uuid;
begin
  select id into v_biz from public.businesses where slug = 'demo';   -- <-- change slug
  if v_biz is null then
    raise notice 'No business with that slug — nothing seeded.';
    return;
  end if;

  insert into public.business_mystery_config (business_id, is_enabled, cooldown_hours)
  values (v_biz, true, 24)
  on conflict (business_id) do update set is_enabled = true;

  if not exists (select 1 from public.mystery_reward_pool where business_id = v_biz and is_active) then
    insert into public.mystery_reward_pool (business_id, prize_name, kind, points_amount, weight, is_active) values
      (v_biz, '50 bonus points',  'points', 50,  80, true),
      (v_biz, '100 bonus points', 'points', 100, 15, true),
      (v_biz, '300 bonus points', 'points', 300, 5,  true);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- OPTIONAL — seed every business that doesn't already have a spin pool:
-- ---------------------------------------------------------------------
-- do $$
-- declare r record;
-- begin
--   for r in select id from public.businesses loop
--     insert into public.business_mystery_config (business_id, is_enabled, cooldown_hours)
--       values (r.id, true, 24)
--       on conflict (business_id) do update set is_enabled = true;
--     if not exists (select 1 from public.mystery_reward_pool where business_id = r.id and is_active) then
--       insert into public.mystery_reward_pool (business_id, prize_name, kind, points_amount, weight, is_active) values
--         (r.id, '50 bonus points',  'points', 50,  80, true),
--         (r.id, '100 bonus points', 'points', 100, 15, true),
--         (r.id, '300 bonus points', 'points', 300, 5,  true);
--     end if;
--   end loop;
-- end $$;
