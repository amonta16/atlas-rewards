-- ============================================================================
-- CP-133 · Prize wheel: up to 16 prizes on the wheel (was 12)
-- ----------------------------------------------------------------------------
-- Run in the Supabase SQL editor. Safe to re-run.
--
-- CP-133.1 FIX: the first version of this file was built from the CP-73
-- function and silently dropped the CP-73.1 hotfix (reward prizes fall back
-- to the reward's own photo via a join on rewards) — so every reward wedge
-- lost its picture. This version is the CP-73.1 body with only the cap
-- changed. Re-running it restores the images.
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
      mrp.id,
      mrp.kind,
      case
        when mrp.kind = 'points' then coalesce(mrp.points_amount, 0)::text || ' points'
        else mrp.prize_name
      end as label,
      mrp.points_amount,
      -- CP-73.1: reward prizes fall back to the reward's own photo.
      coalesce(mrp.prize_image_url, r.image_url) as image_url,
      mrp.created_at
    from public.mystery_reward_pool mrp
    left join public.rewards r on r.id = mrp.reward_id
    where mrp.business_id = p_business_id
      and mrp.is_active
      and mrp.kind <> 'coupon'
    order by mrp.created_at
    limit 16                          -- CP-133: was 12
  )
  select pool.id, pool.kind, pool.label, pool.points_amount, pool.image_url from pool
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
