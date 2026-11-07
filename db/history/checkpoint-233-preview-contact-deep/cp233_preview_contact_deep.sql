-- CP-233: instant app preview v2 — contact capture + "looks like their site" build.
-- Applied to production 2026-11-07 as migration cp233_preview_contact_deep.
--
-- · Contact: the owner's name, mobile, email and SMS consent, captured on the
--   progress screen while the preview builds (the preview opens after they submit).
--   Private: never returned by the public read functions.
-- · Deep build: their hero photo, website font, a short "about", their team, and
--   per-treatment description + photo (inside the treatments jsonb). All photos are
--   downloaded from their own website and re-hosted in storage.
--
-- get_app_preview gains hero_url, font_family, about, team. Its return type
-- changes, so it is dropped and recreated (same grants).
--
-- Undo:
--   alter table public.app_previews drop column if exists contact_name, drop column if exists contact_email,
--     drop column if exists contact_consent_at, drop column if exists contact_at, drop column if exists hero_url,
--     drop column if exists font_family, drop column if exists about, drop column if exists team;
--   (then re-run the CP-232 get_app_preview definition)

alter table public.app_previews
  add column if not exists contact_name       text check (contact_name is null or char_length(contact_name) <= 120),
  add column if not exists contact_email      text check (contact_email is null or char_length(contact_email) <= 200),
  add column if not exists contact_consent_at timestamptz,
  add column if not exists contact_at         timestamptz,
  add column if not exists hero_url           text,
  add column if not exists font_family        text check (font_family is null or font_family ~ '^[A-Za-z0-9 ]{2,40}$'),
  add column if not exists about              text check (about is null or char_length(about) <= 600),
  -- [{ name, title, photo_url|null }]
  add column if not exists team               jsonb not null default '[]'::jsonb;

create index if not exists app_previews_contact_at_idx on public.app_previews (contact_at desc) where contact_at is not null;

drop function if exists public.get_app_preview(text);
create function public.get_app_preview(p_slug text)
returns table (
  slug text, business_name text, address text, phone text, website text,
  logo_url text, logo_is_monogram boolean, colors jsonb, treatments jsonb,
  treatments_are_examples boolean, status text, area_open boolean, expires_at timestamptz,
  hero_url text, font_family text, about text, team jsonb
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.slug, p.business_name, p.address, p.phone, p.website,
         p.logo_url, p.logo_is_monogram, p.colors, p.treatments,
         p.treatments_are_examples, p.status, p.area_open, p.expires_at,
         p.hero_url, p.font_family, p.about, p.team
    from public.app_previews p
   where p.slug = lower(p_slug)
     and p.status in ('ready', 'claimed')
     and p.expires_at > now()
   limit 1;
$$;

revoke all on function public.get_app_preview(text) from public;
grant execute on function public.get_app_preview(text) to anon, authenticated;
