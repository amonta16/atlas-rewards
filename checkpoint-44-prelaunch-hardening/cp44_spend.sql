-- =====================================================================
-- CP-44 — Track $ spent per member (alongside points & visits)
-- =====================================================================
-- Dollar amounts are recorded in public.events.amount_cents whenever the
-- front desk awards by purchase (and via the inbound purchase webhook).
-- These two functions surface total spend so it shows up in the front-desk
-- insights leaderboard and on the member detail (visible to agency admin,
-- managers, and front-desk staff).
-- Idempotent.
-- =====================================================================

-- ----- 1. Leaderboard now returns total spend -----
drop function if exists public.top_loyal_members(uuid, int);
create or replace function public.top_loyal_members(p_business_id uuid, p_limit int default 10)
returns table (
  membership_id uuid, full_name text, email text,
  lifetime_points int, points_balance int, visit_count int,
  last_visit_at timestamptz, total_spent_cents bigint
)
language sql stable security definer set search_path = public as $$
  select m.id, p.full_name, p.email,
         m.lifetime_points_earned, m.points_balance, m.visit_count, m.last_visit_at,
         (select coalesce(sum(e.amount_cents), 0)::bigint
            from public.events e
           where e.membership_id = m.id
             and e.amount_cents is not null) as total_spent_cents
    from public.business_memberships m
    left join public.profiles p on p.id = m.user_id
   where m.business_id = p_business_id
     and public.staffs_business(p_business_id)
   order by m.lifetime_points_earned desc, m.visit_count desc
   limit greatest(1, least(p_limit, 100));
$$;
grant execute on function public.top_loyal_members(uuid, int) to authenticated;

-- ----- 2. Per-member total spend (for the member detail panel) -----
-- Staff-gated (agency admin / manager / front-desk of the membership's
-- business). Returns 0 for non-staff callers.
create or replace function public.member_total_spent(p_membership_id uuid)
returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(sum(e.amount_cents), 0)::bigint
    from public.events e
    join public.business_memberships m on m.id = e.membership_id
   where e.membership_id = p_membership_id
     and e.amount_cents is not null
     and public.staffs_business(m.business_id);
$$;
grant execute on function public.member_total_spent(uuid) to authenticated;

-- ----- 3. Agency leaderboard (top_members) also returns total spend -----
drop function if exists public.top_members(uuid, int);
create or replace function public.top_members(p_business_id uuid, p_limit int default 5)
returns table (
  membership_id uuid, member_name text, member_email text,
  points_balance int, lifetime_points int, tier text, visit_count int,
  total_spent_cents bigint
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.staffs_business(p_business_id) then raise exception 'permission denied'; end if;
  return query
  select m.id, coalesce(p.full_name, split_part(p.email::text, '@', 1)),
         p.email::text, m.points_balance, m.lifetime_points_earned,
         m.tier, m.visit_count,
         (select coalesce(sum(e.amount_cents), 0)::bigint
            from public.events e
           where e.membership_id = m.id and e.amount_cents is not null)
    from public.business_memberships m
    join public.profiles p on p.id = m.user_id
   where m.business_id = p_business_id
   order by m.lifetime_points_earned desc
   limit p_limit;
end; $$;
grant execute on function public.top_members(uuid, int) to authenticated;

notify pgrst, 'reload schema';
