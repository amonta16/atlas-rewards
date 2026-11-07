-- CP-232: instant app preview (the Meta ads lead magnet).
-- Applied to production 2026-11-07 as migration cp232_app_previews.
--
-- A med spa owner types their business name; the server builds a preview of
-- their own Atlas app (logo, colors, treatments) and shows it at
-- med.atlas-engine.app/p/<slug>. One row per preview.
--
-- Security:
--   · RLS is on and there are NO table policies for anon/authenticated, so the
--     table can't be listed or read directly with the public key. Every write
--     goes through the server (service role).
--   · The public reads one preview at a time through get_app_preview(slug):
--     only display columns (no UTMs, click ids, IP hash or contact phone),
--     only status ready/claimed, only before expires_at.
--
-- Undo:
--   drop function if exists public.get_app_preview(text);
--   drop table if exists public.app_previews;

create table if not exists public.app_previews (
  id                       uuid primary key default gen_random_uuid(),
  slug                     text not null unique check (slug ~ '^pv-[a-z0-9-]{3,64}$'),
  place_id                 text,
  business_name            text not null check (char_length(business_name) between 1 and 160),
  address                  text,
  lat                      double precision,
  lng                      double precision,
  phone                    text,
  website                  text,
  logo_url                 text,
  logo_is_monogram         boolean not null default false,
  -- { primary, secondary, accent, onPrimary } as #rrggbb, contrast-checked by the server
  colors                   jsonb not null default '{}'::jsonb,
  -- [{ name, category, price_cents|null, member_price_cents|null }]
  treatments               jsonb not null default '[]'::jsonb,
  treatments_are_examples  boolean not null default false,
  source                   text not null default 'auto' check (source in ('manual', 'auto')),
  status                   text not null default 'building' check (status in ('building', 'ready', 'failed', 'claimed')),
  build_error              text,
  -- 10-mile area check at build time (null = not checked)
  area_open                boolean,
  area_zip                 text,
  expires_at               timestamptz not null default (now() + interval '14 days'),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  built_at                 timestamptz,
  claimed_at               timestamptz,
  -- attribution (private)
  utm_source               text,
  utm_medium               text,
  utm_campaign             text,
  utm_content              text,
  utm_term                 text,
  fbclid                   text,
  fbp                      text,
  fbc                      text,
  lead_event_id            text,
  ip_hash                  text,
  -- desktop "text me my app" fallback (private)
  contact_phone            text,
  created_by               uuid references auth.users(id) on delete set null
);

-- Same spa, same preview: one auto preview per Google place.
create unique index if not exists app_previews_place_id_key
  on public.app_previews (place_id) where place_id is not null;
create index if not exists app_previews_created_at_idx on public.app_previews (created_at desc);

create or replace function public._app_previews_touch()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_app_previews_touch on public.app_previews;
create trigger trg_app_previews_touch before update on public.app_previews
  for each row execute function public._app_previews_touch();

alter table public.app_previews enable row level security;
revoke all on public.app_previews from anon, authenticated;

-- The only public read path.
create or replace function public.get_app_preview(p_slug text)
returns table (
  slug text, business_name text, address text, phone text, website text,
  logo_url text, logo_is_monogram boolean, colors jsonb, treatments jsonb,
  treatments_are_examples boolean, status text, area_open boolean, expires_at timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.slug, p.business_name, p.address, p.phone, p.website,
         p.logo_url, p.logo_is_monogram, p.colors, p.treatments,
         p.treatments_are_examples, p.status, p.area_open, p.expires_at
    from public.app_previews p
   where p.slug = lower(p_slug)
     and p.status in ('ready', 'claimed')
     and p.expires_at > now()
   limit 1;
$$;

-- Tells the page "expired" apart from "never existed", without exposing content.
create or replace function public.app_preview_state(p_slug text)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
           when p.expires_at <= now() then 'expired'
           when p.status in ('ready', 'claimed') then 'ready'
           else p.status
         end
    from public.app_previews p
   where p.slug = lower(p_slug)
   limit 1;
$$;

revoke all on function public.get_app_preview(text) from public;
revoke all on function public.app_preview_state(text) from public;
grant execute on function public.get_app_preview(text) to anon, authenticated;
grant execute on function public.app_preview_state(text) to anon, authenticated;
