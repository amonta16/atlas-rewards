-- CP-159 · (1) desk social awards unblocked, (2) presence is inferred from the
-- desk awarding points — no separate Check-in button needed. Safe to re-run.

-- ── 1. reviews.verification_method accepts 'desk' ───────────────────────────
-- desk_award_social (CP-147) writes verification_method = 'desk'; the CP-32
-- check constraint only knew screenshot/link/manual, so every desk tap failed.
alter table public.reviews drop constraint if exists reviews_verification_method_check;
alter table public.reviews add constraint reviews_verification_method_check
  check (verification_method = any (array['screenshot','link','manual','desk']));

-- ── 2. Auto check-in when staff award points ────────────────────────────────
-- A positive, staff-created ledger row (purchase, quick award, social) means
-- the member is standing at the counter. Count the visit, unlock the wheel,
-- advance the streak when streaks are on — all with the same 12h cooldown
-- the old button had. Never fires for self-serve / system rows (spin, signup
-- bonus, birthday, referral, streak claim, membership).
create or replace function public._auto_checkin_on_award()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_member_user uuid; v_last timestamptz; v_streak_on boolean;
begin
  if new.delta is null or new.delta <= 0 then return new; end if;
  -- Staff-initiated spend/visit rule types only. review + social_follow are
  -- left out: the manager approves those from the queue too, remotely.
  if new.rule_type not in ('purchase','visit','first_visit_bonus','manual','bonus') then
    return new;
  end if;

  select user_id into v_member_user from public.business_memberships where id = new.membership_id;
  -- Only staff-originated rows count as presence.
  if new.created_by is null or new.created_by = v_member_user then return new; end if;
  if not exists (
    select 1 from public.business_users bu
     where bu.user_id = new.created_by
       and (bu.business_id = new.business_id or bu.role in ('agency_admin','agency_va'))
  ) then return new; end if;

  -- 12h cooldown, same as member_checkin.
  select max(created_at) into v_last from public.check_in_events
   where membership_id = new.membership_id;
  if v_last is not null and v_last + interval '12 hours' > now() then return new; end if;

  select coalesce(is_enabled, false) into v_streak_on from public.streak_config where business_id = new.business_id;

  if coalesce(v_streak_on, false) then
    -- Full streak logic (writes check_in_events + visit_count itself).
    begin
      perform public.member_checkin(new.business_id, new.membership_id);
    exception when others then
      raise warning 'auto check-in via member_checkin failed: %', sqlerrm;
    end;
  else
    -- Streaks off: still a visit, still unlocks the wheel.
    insert into public.check_in_events
      (business_id, membership_id, streak_after, awarded_points, is_milestone, milestone_mystery_unlocked, checked_in_by_user_id)
    values (new.business_id, new.membership_id, 0, 0, false, false, new.created_by);
    update public.business_memberships
       set visit_count = case when last_visit_at is null or last_visit_at + interval '12 hours' <= now()
                              then visit_count + 1 else visit_count end,
           last_visit_at = now(),
           status = case when status = 'dormant' then 'active' else status end,
           updated_at = now()
     where id = new.membership_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_auto_checkin_on_award on public.points_ledger;
create trigger trg_auto_checkin_on_award
  after insert on public.points_ledger
  for each row execute function public._auto_checkin_on_award();

-- Desk read: has this member's visit been counted in the last 12h?
drop function if exists public.member_presence(uuid);
create or replace function public.member_presence(p_membership_id uuid)
returns table (checked_in_at timestamptz, cooldown_until timestamptz)
language sql stable security definer set search_path = public as $$
  select e.created_at, e.created_at + interval '12 hours'
    from public.check_in_events e
    join public.business_memberships m on m.id = e.membership_id
   where e.membership_id = p_membership_id
     and public.staffs_business(m.business_id)
     and e.created_at + interval '12 hours' > now()
   order by e.created_at desc limit 1;
$$;
revoke all on function public.member_presence(uuid) from public, anon;
grant execute on function public.member_presence(uuid) to authenticated;
