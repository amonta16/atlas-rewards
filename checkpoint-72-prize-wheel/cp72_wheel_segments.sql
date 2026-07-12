-- ════════════════════════════════════════════════════════════════════════
-- CP-72 — mystery_wheel_segments
--
-- The Prize Wheel's wedges now display the business's REAL prizes
-- ("50 PTS", "Free Latte", "WIN10 coupon") instead of emojis. Customers
-- can't read mystery_reward_pool directly (RLS — and they must not see
-- weights/odds), so this SECURITY DEFINER function exposes ONLY what a
-- wedge needs: kind + display label + point amount. NO weights, NO odds,
-- NO coupon codes (the code is revealed only when won, by
-- spin_daily_reward).
--
-- Empty pool → returns the built-in default prizes (50/100/300 points)
-- so the wheel matches what spin_daily_reward would actually award.
--
-- Run AFTER cp68_games_and_demo.sql (and cp71_prize_peek.sql).
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.mystery_wheel_segments(p_business_id uuid)
returns table (id uuid, kind text, label text, points_amount int)
language sql
stable
security definer
set search_path = public
as $$
  with pool as (
    select
      p.id,
      p.kind,
      case
        when p.kind = 'points' then coalesce(p.points_amount, 0)::text || ' points'
        else p.prize_name
      end as label,
      p.points_amount,
      p.created_at
    from public.mystery_reward_pool p
    where p.business_id = p_business_id
      and p.is_active
    order by p.created_at
    limit 12
  )
  select id, kind, label, points_amount from pool
  union all
  -- Built-in default wheel when no pool is configured (matches
  -- spin_daily_reward's 80/15/5 defaults).
  select * from (
    values
      (null::uuid, 'points', '50 points',  50),
      (null::uuid, 'points', '100 points', 100),
      (null::uuid, 'points', '300 points', 300)
  ) as d(id, kind, label, points_amount)
  where not exists (select 1 from pool);
$$;

grant execute on function public.mystery_wheel_segments(uuid) to authenticated, anon;
