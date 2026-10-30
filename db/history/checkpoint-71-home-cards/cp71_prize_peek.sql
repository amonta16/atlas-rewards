-- ════════════════════════════════════════════════════════════════════════
-- CP-71 — mystery_prize_peek
--
-- The Home spin card now says "Win up to 300 pts" instead of an emoji.
-- Customers can't read mystery_reward_pool directly (RLS — and they
-- shouldn't see weights/odds), so this SECURITY DEFINER function exposes
-- ONLY the headline number:
--
--   max_points  — the biggest active points prize in the pool. When the
--                 pool is empty the spin falls back to the built-in
--                 50/100/300 default prizes (see spin_daily_reward), so
--                 we return 300 to match.
--   has_special — true when the pool also holds non-point prizes
--                 (rewards / coupons), so the card can say
--                 "Prizes up for grabs" when there are no point prizes.
--
-- No weights, no odds, no prize list — just the teaser.
-- Run AFTER cp68_games_and_demo.sql.
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.mystery_prize_peek(p_business_id uuid)
returns table (max_points int, has_special boolean)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(
      max(points_amount) filter (where kind = 'points'),
      case when count(*) = 0 then 300 end   -- empty pool → built-in default jackpot
    )::int                                   as max_points,
    coalesce(bool_or(kind <> 'points'), false) as has_special
  from public.mystery_reward_pool
  where business_id = p_business_id
    and is_active;
$$;

grant execute on function public.mystery_prize_peek(uuid) to authenticated, anon;
