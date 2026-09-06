-- ============================================================================
-- CP-132 · Events + weekly specials (the content behind the Events tab)
-- ----------------------------------------------------------------------------
-- Run in the Supabase SQL editor BEFORE deploying the CP-132 app build.
-- Self-contained: safe to re-run.
--
-- Two small tables, modelled on news_posts (CP-14):
--   business_events    — dated happenings: tournaments, Veterans Day, league
--                        night. Shown on Home ("Coming up") and the Events tab.
--   business_specials  — the weekly deal calendar: "Tue $2 games", "Thu
--                        unlimited after 7pm". Shown as a "This week" strip.
--
-- Reads are public RPCs (customer app), writes go through staffs_business-
-- gated RPCs exactly like news. Both tables carry RLS as a second wall.
-- ============================================================================

-- ── 1. Events ────────────────────────────────────────────────────────────
create table if not exists public.business_events (
  id            uuid primary key default uuid_generate_v4(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  title         text not null,
  description   text,
  image_url     text,
  starts_at     timestamptz not null,
  ends_at       timestamptz,
  location_note text,                 -- "Back room", "Cage 3", "Main floor"
  cta_label     text,                 -- "Sign up", "Reserve a lane"
  cta_url       text,
  is_published  boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists business_events_upcoming_idx
  on public.business_events (business_id, is_published, starts_at);

alter table public.business_events enable row level security;
do $$ begin
  begin drop policy "events_public_read" on public.business_events; exception when undefined_object then null; end;
  begin drop policy "events_staff_write" on public.business_events; exception when undefined_object then null; end;
end $$;
create policy "events_public_read" on public.business_events for select to public
  using (is_published);
create policy "events_staff_write" on public.business_events for all to authenticated
  using (public.staffs_business(business_id))
  with check (public.staffs_business(business_id));

-- Customer side: upcoming (or still running) published events.
drop function if exists public.list_business_events(uuid, int);
create function public.list_business_events(p_business_id uuid, p_limit int default 10)
returns table (
  id uuid, title text, description text, image_url text,
  starts_at timestamptz, ends_at timestamptz, location_note text,
  cta_label text, cta_url text
)
language sql stable security definer set search_path = public as $$
  select id, title, description, image_url, starts_at, ends_at, location_note, cta_label, cta_url
    from public.business_events
   where business_id = p_business_id
     and is_published
     and coalesce(ends_at, starts_at + interval '3 hours') >= now() - interval '1 hour'
   order by starts_at asc
   limit greatest(1, p_limit);
$$;
grant execute on function public.list_business_events(uuid, int) to anon, authenticated;

-- Staff side: create / edit.
drop function if exists public.upsert_business_event(uuid, uuid, text, text, text, timestamptz, timestamptz, text, text, text, boolean);
create function public.upsert_business_event(
  p_id            uuid,
  p_business_id   uuid,
  p_title         text,
  p_description   text,
  p_image_url     text,
  p_starts_at     timestamptz,
  p_ends_at       timestamptz,
  p_location_note text,
  p_cta_label     text,
  p_cta_url       text,
  p_is_published  boolean
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.staffs_business(p_business_id) then raise exception 'permission denied'; end if;
  if nullif(btrim(p_title), '') is null then raise exception 'title required'; end if;
  if p_starts_at is null then raise exception 'start time required'; end if;
  if p_id is null then
    insert into public.business_events
      (business_id, title, description, image_url, starts_at, ends_at, location_note, cta_label, cta_url, is_published)
    values
      (p_business_id, btrim(p_title), p_description, p_image_url, p_starts_at, p_ends_at, p_location_note, p_cta_label, p_cta_url, coalesce(p_is_published, true))
    returning id into v_id;
  else
    update public.business_events set
      title = btrim(p_title), description = p_description, image_url = p_image_url,
      starts_at = p_starts_at, ends_at = p_ends_at, location_note = p_location_note,
      cta_label = p_cta_label, cta_url = p_cta_url,
      is_published = coalesce(p_is_published, true), updated_at = now()
    where id = p_id and business_id = p_business_id
    returning id into v_id;
  end if;
  return v_id;
end; $$;
grant execute on function public.upsert_business_event(uuid, uuid, text, text, text, timestamptz, timestamptz, text, text, text, boolean) to authenticated;

drop function if exists public.delete_business_event(uuid, uuid);
create function public.delete_business_event(p_id uuid, p_business_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.staffs_business(p_business_id) then raise exception 'permission denied'; end if;
  delete from public.business_events where id = p_id and business_id = p_business_id;
end; $$;
grant execute on function public.delete_business_event(uuid, uuid) to authenticated;

-- ── 2. Weekly specials ──────────────────────────────────────────────────
create table if not exists public.business_specials (
  id            uuid primary key default uuid_generate_v4(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  day_of_week   smallint not null check (day_of_week between 0 and 6),  -- 0 = Sunday
  title         text not null,        -- "$2 games"
  detail        text,                 -- "All day · arcade only"
  is_active     boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists business_specials_idx
  on public.business_specials (business_id, is_active, day_of_week, sort_order);

alter table public.business_specials enable row level security;
do $$ begin
  begin drop policy "specials_public_read" on public.business_specials; exception when undefined_object then null; end;
  begin drop policy "specials_staff_write" on public.business_specials; exception when undefined_object then null; end;
end $$;
create policy "specials_public_read" on public.business_specials for select to public
  using (is_active);
create policy "specials_staff_write" on public.business_specials for all to authenticated
  using (public.staffs_business(business_id))
  with check (public.staffs_business(business_id));

drop function if exists public.list_business_specials(uuid);
create function public.list_business_specials(p_business_id uuid)
returns table (id uuid, day_of_week smallint, title text, detail text, sort_order int)
language sql stable security definer set search_path = public as $$
  select id, day_of_week, title, detail, sort_order
    from public.business_specials
   where business_id = p_business_id and is_active
   order by day_of_week, sort_order, created_at;
$$;
grant execute on function public.list_business_specials(uuid) to anon, authenticated;

drop function if exists public.upsert_business_special(uuid, uuid, smallint, text, text, boolean, int);
create function public.upsert_business_special(
  p_id          uuid,
  p_business_id uuid,
  p_day_of_week smallint,
  p_title       text,
  p_detail      text,
  p_is_active   boolean,
  p_sort_order  int
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.staffs_business(p_business_id) then raise exception 'permission denied'; end if;
  if nullif(btrim(p_title), '') is null then raise exception 'title required'; end if;
  if p_id is null then
    insert into public.business_specials (business_id, day_of_week, title, detail, is_active, sort_order)
    values (p_business_id, p_day_of_week, btrim(p_title), p_detail, coalesce(p_is_active, true), coalesce(p_sort_order, 0))
    returning id into v_id;
  else
    update public.business_specials set
      day_of_week = p_day_of_week, title = btrim(p_title), detail = p_detail,
      is_active = coalesce(p_is_active, true), sort_order = coalesce(p_sort_order, 0), updated_at = now()
    where id = p_id and business_id = p_business_id
    returning id into v_id;
  end if;
  return v_id;
end; $$;
grant execute on function public.upsert_business_special(uuid, uuid, smallint, text, text, boolean, int) to authenticated;

drop function if exists public.delete_business_special(uuid, uuid);
create function public.delete_business_special(p_id uuid, p_business_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.staffs_business(p_business_id) then raise exception 'permission denied'; end if;
  delete from public.business_specials where id = p_id and business_id = p_business_id;
end; $$;
grant execute on function public.delete_business_special(uuid, uuid) to authenticated;

-- ── verify ──────────────────────────────────────────────────────────────
-- select * from public.list_business_events('<business uuid>', 10);
-- select * from public.list_business_specials('<business uuid>');
