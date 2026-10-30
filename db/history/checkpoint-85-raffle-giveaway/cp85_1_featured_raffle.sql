-- =====================================================================
-- CP-85.1 — Raffle acts like a FEATURED offer
-- =====================================================================
-- Run AFTER cp85_raffles.sql. Idempotent — safe to re-run.
--
-- Andrew's call (Jul 26, 2026): a raffle should surface exactly like the
-- featured offer does — the sticky banner at the top of every customer
-- tab AND the big glow-ring Featured card on the Home tab, with an
-- Enter button. This migration adds:
--   1) raffles.is_featured (default TRUE — a raffle is a hype event)
--   2) upsert_raffle rebuilt with p_is_featured
--   3) featured_raffle(p_business_id) — the banner/Home-card feed:
--      the featured raffle that hasn't ended yet (open first, then
--      soonest-ending), with computed state + live entry count
--   4) list_raffles_for_business rebuilt to return is_featured
-- =====================================================================

begin;

-- ── 1) Column ────────────────────────────────────────────────────────
alter table public.raffles
  add column if not exists is_featured boolean not null default true;

comment on column public.raffles.is_featured is
  'CP-85.1: featured raffles take over the customer sticky banner + Home featured card while scheduled/open.';

-- ── 2) upsert_raffle — add p_is_featured ────────────────────────────
-- Drop the CP-85 signature so PostgREST resolution stays unambiguous.
drop function if exists public.upsert_raffle(uuid, uuid, text, text, text, text, int, timestamptz, timestamptz, text, int, int, text, text, int);

create or replace function public.upsert_raffle(
  p_id                        uuid,
  p_business_id               uuid,
  p_title                     text,
  p_description               text default null,
  p_image_url                 text default null,
  p_prize                     text default '',
  p_entry_cost_points         int  default 0,
  p_starts_at                 timestamptz default now(),
  p_ends_at                   timestamptz default null,
  p_timezone                  text default 'America/Los_Angeles',
  p_max_entries_per_customer  int  default 1,
  p_total_entry_limit         int  default null,
  p_terms                     text default null,
  p_winner_display            text default 'first_last_initial',
  p_claim_deadline_days       int  default null,
  p_is_featured               boolean default true
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id     uuid;
  v_status text;
begin
  if not public.staffs_business(p_business_id) then
    raise exception 'permission denied';
  end if;
  if p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'end time must be after start time';
  end if;
  if coalesce(p_title, '') = '' or coalesce(p_prize, '') = '' then
    raise exception 'title and prize are required';
  end if;

  if p_id is null then
    insert into public.raffles
      (business_id, title, description, image_url, prize, entry_cost_points,
       starts_at, ends_at, timezone, max_entries_per_customer, total_entry_limit,
       terms, winner_display, claim_deadline_days, is_featured, created_by)
    values
      (p_business_id, p_title, p_description, p_image_url, p_prize, p_entry_cost_points,
       p_starts_at, p_ends_at, p_timezone, p_max_entries_per_customer, p_total_entry_limit,
       p_terms, p_winner_display, p_claim_deadline_days, coalesce(p_is_featured, true), auth.uid())
    returning id into v_id;

    insert into public.raffle_audit (raffle_id, business_id, actor, action, detail)
    values (v_id, p_business_id, auth.uid(), 'created',
            jsonb_build_object('title', p_title, 'entry_cost', p_entry_cost_points,
                               'ends_at', p_ends_at, 'timezone', p_timezone,
                               'is_featured', coalesce(p_is_featured, true)));
  else
    select status into v_status from public.raffles
     where id = p_id and business_id = p_business_id
     for update;
    if v_status is null then
      raise exception 'raffle not found';
    end if;
    if v_status <> 'active' then
      raise exception 'this raffle is % — it can no longer be edited', v_status;
    end if;

    update public.raffles set
      title                    = p_title,
      description              = p_description,
      image_url                = p_image_url,
      prize                    = p_prize,
      entry_cost_points        = p_entry_cost_points,
      starts_at                = p_starts_at,
      ends_at                  = p_ends_at,
      timezone                 = p_timezone,
      max_entries_per_customer = p_max_entries_per_customer,
      total_entry_limit        = p_total_entry_limit,
      terms                    = p_terms,
      winner_display           = p_winner_display,
      claim_deadline_days      = p_claim_deadline_days,
      is_featured              = coalesce(p_is_featured, true),
      updated_at               = now()
    where id = p_id and business_id = p_business_id
    returning id into v_id;

    insert into public.raffle_audit (raffle_id, business_id, actor, action, detail)
    values (v_id, p_business_id, auth.uid(), 'updated',
            jsonb_build_object('title', p_title, 'ends_at', p_ends_at,
                               'timezone', p_timezone,
                               'is_featured', coalesce(p_is_featured, true)));
  end if;

  return v_id;
end; $$;

grant execute on function public.upsert_raffle(uuid, uuid, text, text, text, text, int, timestamptz, timestamptz, text, int, int, text, text, int, boolean) to authenticated;

-- ── 3) featured_raffle — feeds the sticky banner + Home featured card ─
drop function if exists public.featured_raffle(uuid);

create or replace function public.featured_raffle(p_business_id uuid)
returns table (
  id                uuid,
  title             text,
  description       text,
  image_url         text,
  prize             text,
  entry_cost_points int,
  starts_at         timestamptz,
  ends_at           timestamptz,
  timezone          text,
  state             text,          -- 'scheduled' | 'open'
  total_entries     int
)
language sql stable security definer set search_path = public as $$
  select
    r.id, r.title, r.description, r.image_url, r.prize, r.entry_cost_points,
    r.starts_at, r.ends_at, r.timezone,
    case when now() < r.starts_at then 'scheduled' else 'open' end as state,
    (select count(*)::int from public.raffle_entries e where e.raffle_id = r.id) as total_entries
  from public.raffles r
  where r.business_id = p_business_id
    and r.status = 'active'
    and r.is_featured
    and now() < r.ends_at
  order by
    case when now() >= r.starts_at then 0 else 1 end,  -- open beats scheduled
    r.ends_at asc
  limit 1;
$$;

grant execute on function public.featured_raffle(uuid) to anon, authenticated;

-- ── 4) list_raffles_for_business — surface is_featured ───────────────
drop function if exists public.list_raffles_for_business(uuid);

create or replace function public.list_raffles_for_business(p_business_id uuid)
returns table (
  id uuid, title text, description text, image_url text, prize text,
  entry_cost_points int, starts_at timestamptz, ends_at timestamptz,
  timezone text, max_entries_per_customer int, total_entry_limit int,
  terms text, winner_display text, claim_deadline_days int,
  status text, state text, prize_claim_status text, drawn_at timestamptz,
  total_entries int, unique_participants int, winner_display_name text,
  is_featured boolean
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
    r.is_featured
  from public.raffles r
  where r.business_id = p_business_id
    and public.staffs_business(p_business_id)
  order by r.created_at desc;
$$;

grant execute on function public.list_raffles_for_business(uuid) to authenticated;

commit;

notify pgrst, 'reload schema';

-- Verification:
--   select column_name from information_schema.columns
--    where table_name='raffles' and column_name='is_featured';
--   select proname, pronargs from pg_proc where proname in
--    ('upsert_raffle','featured_raffle','list_raffles_for_business');
