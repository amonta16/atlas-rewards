-- CP-244 (lead-magnet audit, step 7): the lead magnet's own events, for the render-to-book rate.
-- Applied to production 2026-11-10 as migration cp244_preview_events.
--
--   preview_events   one row per preview per event: first_at, last_at, count, a little meta.
--     build_started     a build began (/api/preview/start)
--     app_rendered      their app was on screen (/p/<slug>, from the page)
--     brand_overridden  they fixed the logo or color (/api/preview/brand)
--     notif_previewed   they tapped "Send me a test push"
--     gate_submitted    they unlocked it: email + zip (/api/preview/unlock)
--     portal_login      they opened their front desk (/api/preview/progress desk_visit)
--     vsl_played        the first-login video started playing
--     csv_imported      they imported their patient list (count in meta)
--     app_installed     their app was opened from a phone's Home Screen
--     book_clicked      any "Book 15 min" link: page, email, text, desk (/medspa/walkthrough/<slug>, src in meta)
--
-- Render-to-book = previews with book_clicked ÷ previews with app_rendered. Under 3% is a red alert on
-- the product, not the copy.
--
-- record_preview_event() is the only writer: insert, or bump count/last_at. Service role only.
--
-- Undo:
--   drop function if exists public.record_preview_event(uuid, text, jsonb);
--   drop table if exists public.preview_events;

create table if not exists public.preview_events (
  preview_id  uuid not null references public.app_previews(id) on delete cascade,
  event       text not null check (event in ('build_started', 'app_rendered', 'brand_overridden', 'notif_previewed', 'gate_submitted',
                                             'portal_login', 'vsl_played', 'csv_imported', 'app_installed', 'book_clicked')),
  first_at    timestamptz not null default now(),
  last_at     timestamptz not null default now(),
  count       integer not null default 1,
  meta        jsonb not null default '{}'::jsonb check (octet_length(meta::text) <= 2000),
  primary key (preview_id, event)
);
create index if not exists preview_events_event_first_idx on public.preview_events (event, first_at desc);
alter table public.preview_events enable row level security;

create or replace function public.record_preview_event(p_preview uuid, p_event text, p_meta jsonb default '{}'::jsonb)
returns void
language sql
security invoker
set search_path = public
as $$
  insert into public.preview_events (preview_id, event, meta)
  values (p_preview, p_event, coalesce(p_meta, '{}'::jsonb))
  on conflict (preview_id, event) do update
    set count = public.preview_events.count + 1,
        last_at = now(),
        meta = public.preview_events.meta || coalesce(excluded.meta, '{}'::jsonb);
$$;
revoke all on function public.record_preview_event(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_preview_event(uuid, text, jsonb) to service_role;
