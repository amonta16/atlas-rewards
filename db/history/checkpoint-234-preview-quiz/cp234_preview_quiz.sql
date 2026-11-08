-- CP-234: instant app preview v3 — Dermis-style steps (contact → phone code → quiz).
-- Applied to production 2026-11-07 as migration cp234_preview_quiz.
--
-- · Quiz answers on the preview row: booking tool, what they offer, what's holding
--   them back (2), top priorities (2). Private, except `priorities`, which the
--   public preview page uses to choose its headline.
-- · phone_verified_at: set when the 6-digit texted code checks out (Twilio Verify;
--   the step is off until PREVIEW_VERIFY_PHONE=1 and Twilio is configured).
-- · landing_lead_id: the qualified lead created in the existing /medspa funnel when
--   the quiz is done, so "Book a 15-min walkthrough" opens the same calendar
--   (/medspa/start?lead=<id>) with the same reminders and Meta Schedule event.
--
-- get_app_preview gains `priorities` (dropped and recreated; same grants).
--
-- Undo:
--   alter table public.app_previews drop column if exists booking_system, drop column if exists offered,
--     drop column if exists challenges, drop column if exists priorities, drop column if exists quiz_at,
--     drop column if exists phone_verified_at, drop column if exists landing_lead_id;
--   (then re-run the CP-233 get_app_preview definition)

alter table public.app_previews
  add column if not exists booking_system    text check (booking_system is null or char_length(booking_system) <= 60),
  add column if not exists offered           text[] not null default '{}',
  add column if not exists challenges        text[] not null default '{}',
  add column if not exists priorities        text[] not null default '{}',
  add column if not exists quiz_at           timestamptz,
  add column if not exists phone_verified_at timestamptz,
  add column if not exists landing_lead_id   uuid references public.landing_leads(id) on delete set null;

alter table public.app_previews
  add constraint app_previews_offered_len    check (cardinality(offered) <= 40),
  add constraint app_previews_challenges_len check (cardinality(challenges) <= 4),
  add constraint app_previews_priorities_len check (cardinality(priorities) <= 4);

drop function if exists public.get_app_preview(text);
create function public.get_app_preview(p_slug text)
returns table (
  slug text, business_name text, address text, phone text, website text,
  logo_url text, logo_is_monogram boolean, colors jsonb, treatments jsonb,
  treatments_are_examples boolean, status text, area_open boolean, expires_at timestamptz,
  hero_url text, font_family text, about text, team jsonb, priorities text[]
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.slug, p.business_name, p.address, p.phone, p.website,
         p.logo_url, p.logo_is_monogram, p.colors, p.treatments,
         p.treatments_are_examples, p.status, p.area_open, p.expires_at,
         p.hero_url, p.font_family, p.about, p.team, p.priorities
    from public.app_previews p
   where p.slug = lower(p_slug)
     and p.status in ('ready', 'claimed')
     and p.expires_at > now()
   limit 1;
$$;

revoke all on function public.get_app_preview(text) from public;
grant execute on function public.get_app_preview(text) to anon, authenticated;
