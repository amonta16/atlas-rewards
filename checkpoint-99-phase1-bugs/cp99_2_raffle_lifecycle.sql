-- =====================================================================
-- CP-99 · Phase 2 — RAFFLE LIFECYCLE (roadmap item #14)
-- =====================================================================
-- Apply in the Supabase SQL editor AFTER cp99_visits_fix.sql. Idempotent.
--
-- WHAT THIS ADDS
--   • raffles.archived_at (nullable timestamptz) — archiving is a FLAG,
--     never a status change, so a raffle's historical status/results
--     (winner_selected, drawn_at, winner_membership_id) stay immutable.
--   • archive_raffle / unarchive_raffle — staff-gated. Active raffles
--     CANNOT be archived (cancel first, which refunds entries).
--   • duplicate_raffle — copies a raffle's configuration into a fresh
--     raffle starting tomorrow with the same duration. New raffle is a
--     normal 'active' raffle, editable via upsert_raffle as usual.
--   • list_raffles_for_business — re-created (CP-85.1 base, verbatim)
--     + archived_at in the result so the manager UI can filter.
--   • list_active_raffles — re-created (CP-85 base, verbatim) + skips
--     archived raffles → archiving a drawn raffle removes it from the
--     customer app INSTANTLY (no more waiting out the 14-day window).
--
-- DELIBERATELY OMITTED: hard delete. Entries, refunds, and winner
-- records reference raffle rows; archive covers every operational need
-- without an irreversible action.
--
-- UNTOUCHED: enter_raffle, finalize_raffle (CSPRNG draw), cancel_raffle,
-- redraw_raffle, featured_raffle (featured only serves ACTIVE raffles,
-- which can never be archived, so it needs no filter).
-- =====================================================================

alter table public.raffles
  add column if not exists archived_at timestamptz;

-- ─────────────────────────────────────────────────────────────────────
-- archive / unarchive
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.archive_raffle(
  p_raffle_id   uuid,
  p_business_id uuid
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status text;
begin
  if not public.staffs_business(p_business_id) then
    raise exception 'permission denied';
  end if;

  select status into v_status from public.raffles
   where id = p_raffle_id and business_id = p_business_id
   for update;
  if v_status is null then raise exception 'raffle not found'; end if;
  if v_status = 'active' then
    raise exception 'an active raffle cannot be archived — cancel it first (entries are refunded)';
  end if;

  update public.raffles
     set archived_at = now(), updated_at = now()
   where id = p_raffle_id and archived_at is null;
end; $$;

grant execute on function public.archive_raffle(uuid, uuid) to authenticated;

create or replace function public.unarchive_raffle(
  p_raffle_id   uuid,
  p_business_id uuid
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.staffs_business(p_business_id) then
    raise exception 'permission denied';
  end if;

  update public.raffles
     set archived_at = null, updated_at = now()
   where id = p_raffle_id and business_id = p_business_id;
end; $$;

grant execute on function public.unarchive_raffle(uuid, uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- duplicate — config copy into a fresh raffle (starts tomorrow, same
-- duration). Winner/draw/entry data is NOT copied — it's a new raffle.
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.duplicate_raffle(
  p_raffle_id   uuid,
  p_business_id uuid
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_r      public.raffles%rowtype;
  v_new_id uuid;
  v_duration interval;
begin
  if not public.staffs_business(p_business_id) then
    raise exception 'permission denied';
  end if;

  select * into v_r from public.raffles
   where id = p_raffle_id and business_id = p_business_id;
  if v_r.id is null then raise exception 'raffle not found'; end if;

  v_duration := greatest(v_r.ends_at - v_r.starts_at, interval '1 hour');

  insert into public.raffles
    (business_id, title, description, image_url, prize, entry_cost_points,
     starts_at, ends_at, timezone, max_entries_per_customer,
     total_entry_limit, terms, claim_deadline_days, winner_display,
     is_featured, status)
  values
    (v_r.business_id, v_r.title, v_r.description, v_r.image_url, v_r.prize,
     v_r.entry_cost_points,
     now() + interval '1 day', now() + interval '1 day' + v_duration,
     v_r.timezone, v_r.max_entries_per_customer,
     v_r.total_entry_limit, v_r.terms, v_r.claim_deadline_days,
     v_r.winner_display, v_r.is_featured, 'active')
  returning id into v_new_id;

  return v_new_id;
end; $$;

grant execute on function public.duplicate_raffle(uuid, uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- list_raffles_for_business — CP-85.1 definition + archived_at
-- ─────────────────────────────────────────────────────────────────────
drop function if exists public.list_raffles_for_business(uuid);

create or replace function public.list_raffles_for_business(p_business_id uuid)
returns table (
  id uuid, title text, description text, image_url text, prize text,
  entry_cost_points int, starts_at timestamptz, ends_at timestamptz,
  timezone text, max_entries_per_customer int, total_entry_limit int,
  terms text, winner_display text, claim_deadline_days int,
  status text, state text, prize_claim_status text, drawn_at timestamptz,
  total_entries int, unique_participants int, winner_display_name text,
  is_featured boolean, archived_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    r.id, r.title, r.description, r.image_url, r.prize,
    r.entry_cost_points, r.starts_at, r.ends_at,
    r.timezone, r.max_entries_per_customer, r.total_entry_limit,
    r.terms, r.winner_display, r.claim_deadline_days,
    r.status,
    case
      when r.status = 'cancelled'        then 'cancelled'
      when r.status = 'winner_selected'  then 'winner_selected'
      when r.status = 'ended_no_entries' then 'ended'
      when now() < r.starts_at           then 'scheduled'
      when now() < r.ends_at             then 'open'
      else 'ended'
    end as state,
    r.prize_claim_status, r.drawn_at,
    (select count(*)::int from public.raffle_entries e where e.raffle_id = r.id),
    (select count(distinct e.membership_id)::int from public.raffle_entries e where e.raffle_id = r.id),
    public.raffle_winner_display_name(r.id),
    r.is_featured,
    r.archived_at
  from public.raffles r
  where r.business_id = p_business_id
    and public.staffs_business(p_business_id)
  order by r.created_at desc;
$$;

grant execute on function public.list_raffles_for_business(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- list_active_raffles — CP-85 definition + archived filter (customer)
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.list_active_raffles(p_business_id uuid)
returns table (
  id                        uuid,
  title                     text,
  description               text,
  image_url                 text,
  prize                     text,
  entry_cost_points         int,
  starts_at                 timestamptz,
  ends_at                   timestamptz,
  timezone                  text,
  max_entries_per_customer  int,
  total_entry_limit         int,
  terms                     text,
  claim_deadline_days       int,
  state                     text,
  total_entries             int,
  drawn_at                  timestamptz,
  winner_display_name       text,
  i_won                     boolean,
  my_entry_count            int
)
language sql stable security definer set search_path = public as $$
  select
    r.id, r.title, r.description, r.image_url, r.prize, r.entry_cost_points,
    r.starts_at, r.ends_at, r.timezone, r.max_entries_per_customer,
    r.total_entry_limit, r.terms, r.claim_deadline_days,
    case
      when r.status = 'cancelled'        then 'cancelled'
      when r.status = 'winner_selected'  then 'winner_selected'
      when r.status = 'ended_no_entries' then 'ended'
      when now() < r.starts_at           then 'scheduled'
      when now() < r.ends_at             then 'open'
      else 'ended'
    end as state,
    (select count(*)::int from public.raffle_entries e where e.raffle_id = r.id) as total_entries,
    r.drawn_at,
    public.raffle_winner_display_name(r.id) as winner_display_name,
    (r.winner_membership_id is not null and exists (
       select 1 from public.business_memberships m
        where m.id = r.winner_membership_id and m.user_id = auth.uid()
    )) as i_won,
    coalesce((
      select count(*)::int from public.raffle_entries e
        join public.business_memberships m on m.id = e.membership_id
       where e.raffle_id = r.id and m.user_id = auth.uid()
    ), 0) as my_entry_count
  from public.raffles r
  where r.business_id = p_business_id
    and r.status <> 'cancelled'
    and r.archived_at is null
    and (
      r.status = 'active'
      or (r.status = 'winner_selected'  and r.drawn_at > now() - interval '14 days')
      or (r.status = 'ended_no_entries' and r.ends_at  > now() - interval '2 days')
    )
  order by
    case when r.status = 'active' and now() >= r.starts_at and now() < r.ends_at then 0
         when r.status = 'active' and now() <  r.starts_at then 1
         else 2 end,
    r.ends_at asc;
$$;

grant execute on function public.list_active_raffles(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
