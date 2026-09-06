-- ============================================================================
-- CP-133 · Prize wheel: up to 16 prizes on the wheel (was 12)
-- ----------------------------------------------------------------------------
-- Run in the Supabase SQL editor with the CP-133 app build. Safe to re-run.
-- Same function as CP-73, only the cap changes — the wheel now draws one
-- wedge per prize up to 16 (8 minimum; short pools repeat to fill).
-- ============================================================================
create or replace function public.mystery_wheel_segments(p_business_id uuid)
returns table (id uuid, kind text, label text, points_amount int, image_url text)
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
      p.prize_image_url as image_url,
      p.created_at
    from public.mystery_reward_pool p
    where p.business_id = p_business_id
      and p.is_active
      and p.kind <> 'coupon'          -- CP-73: coupons removed
    order by p.created_at
    limit 16                          -- CP-133: was 12
  )
  select id, kind, label, points_amount, image_url from pool
  union all
  select * from (
    values
      (null::uuid, 'points', '50 points',  50,  null::text),
      (null::uuid, 'points', '100 points', 100, null::text),
      (null::uuid, 'points', '300 points', 300, null::text)
  ) as d(id, kind, label, points_amount, image_url)
  where not exists (select 1 from pool);
$$;
grant execute on function public.mystery_wheel_segments(uuid) to authenticated, anon;
