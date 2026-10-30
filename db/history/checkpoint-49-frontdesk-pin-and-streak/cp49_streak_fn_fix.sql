-- =====================================================================
-- CP-49 fix — get_streak_status return-type change
-- =====================================================================
-- Run this if cp49_migration.sql stopped on:
--   ERROR 42P13: cannot change return type of existing function
--
-- Everything BEFORE get_streak_status in the migration already ran
-- (the front_desk_pins tables, RPCs, and the milestone cleanup), so you
-- only need this. It drops the old function (different return type) and
-- recreates it with the period_start / period_end columns. Idempotent.
-- =====================================================================

drop function if exists public.get_streak_status(uuid, uuid);

create function public.get_streak_status(
  p_business_id   uuid,
  p_membership_id uuid
)
returns table (
  is_enabled         boolean,
  period_type        text,
  checkins_required_per_period int,
  current_streak     int,
  longest_streak     int,
  total_checkins     int,
  last_checkin_at    timestamptz,
  checked_in_this_period boolean,
  milestones         jsonb,
  claimed_milestones int[],
  period_start       timestamptz,
  period_end         timestamptz
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_cfg   record;
  v_state record;
  v_period_start timestamptz;
  v_period_end   timestamptz;
  v_enriched jsonb;
begin
  select * into v_cfg from public.streak_config where business_id = p_business_id;
  if v_cfg is null or not v_cfg.is_enabled then
    is_enabled := false;
    return next; return;
  end if;

  v_period_start := public.streak_period_start(now(), v_cfg.period_type);
  v_period_end := case v_cfg.period_type
    when 'daily'   then v_period_start + interval '1 day'
    when 'weekly'  then v_period_start + interval '1 week'
    when 'monthly' then v_period_start + interval '1 month'
    else v_period_start + interval '1 day'
  end;

  select * into v_state from public.member_streaks
   where business_id = p_business_id and membership_id = p_membership_id;

  with src as (
    select m.elem, m.ord
      from jsonb_array_elements(coalesce(v_cfg.milestones, '[]'::jsonb))
           with ordinality as m(elem, ord)
  )
  select coalesce(jsonb_agg(
           case
             when (src.elem->>'gift_kind') = 'reward'
              and nullif(src.elem->>'reward_id','') is not null
             then src.elem || jsonb_build_object(
                    'reward_image_url', r.image_url,
                    'reward_name',      r.name
                  )
             else (src.elem - 'reward_image_url' - 'reward_name')
           end
           order by src.ord
         ), '[]'::jsonb)
    into v_enriched
    from src
    left join public.rewards r
      on (src.elem->>'gift_kind') = 'reward'
     and r.id = nullif(src.elem->>'reward_id','')::uuid;

  is_enabled                  := true;
  period_type                 := v_cfg.period_type;
  checkins_required_per_period:= v_cfg.checkins_required_per_period;
  current_streak              := coalesce(v_state.current_streak, 0);
  longest_streak              := coalesce(v_state.longest_streak, 0);
  total_checkins              := coalesce(v_state.total_checkins, 0);
  last_checkin_at             := v_state.last_checkin_at;
  checked_in_this_period      := v_state.period_started_at = v_period_start
                                  and v_state.current_period_checkins >= v_cfg.checkins_required_per_period;
  milestones                  := v_enriched;
  claimed_milestones          := coalesce(v_state.claimed_milestones, '{}'::int[]);
  period_start                := v_period_start;
  period_end                  := v_period_end;
  return next;
end; $$;
grant execute on function public.get_streak_status(uuid, uuid) to authenticated;

-- Belt-and-suspenders: re-run the points-milestone cleanup in case the
-- migration stopped before it (drops stale reward_id on points milestones).
update public.streak_config sc
   set milestones = (
     select coalesce(jsonb_agg(
              case
                when (m->>'gift_kind') = 'points'
                     and coalesce(m->>'reward_id','') <> ''
                then (m - 'reward_id')
                else m
              end
              order by ord
            ), '[]'::jsonb)
       from jsonb_array_elements(sc.milestones) with ordinality as t(m, ord)
   )
 where sc.milestones is not null
   and exists (
     select 1 from jsonb_array_elements(sc.milestones) m
      where (m->>'gift_kind') = 'points'
        and coalesce(m->>'reward_id','') <> ''
   );

notify pgrst, 'reload schema';
