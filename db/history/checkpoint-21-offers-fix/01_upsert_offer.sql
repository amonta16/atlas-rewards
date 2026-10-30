-- =====================================================================
-- CHECKPOINT 21 — Unblock "Save offer" in the agency / manager UI
-- =====================================================================
-- Symptom in the UI:
--   "Could not find the function public.upsert_offer(p_business_id,
--    p_description, p_expires_at, p_id, p_image_url, p_is_active,
--    p_is_featured, p_title) in the schema cache"
--
-- Root cause:
--   The function definition shipped in checkpoint-20-fixes/01_fixes.sql
--   was never applied to this Supabase project (or PostgREST's schema
--   cache wasn't reloaded after applying it). The client code in
--   components/agency/offers-manager.tsx calls supabase.rpc('upsert_offer', …)
--   and PostgREST returns this error when the function isn't in its cache.
--
-- This file is a standalone, idempotent paste-into-Supabase fix. Run it
-- in the Supabase SQL editor (Project → SQL → New query → Run). Safe to
-- re-run — it drops and recreates the function each time.
--
-- After running, the schema-cache NOTIFY at the bottom tells PostgREST
-- to pick up the new definition without needing a project restart.
-- =====================================================================

-- ----- 1. Make sure the offers table is in place -----
-- Idempotent: only creates if checkpoint-13 / checkpoint-20 was skipped.
create table if not exists public.offers (
  id          uuid primary key default uuid_generate_v4(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  title       text not null,
  description text,
  image_url   text,
  starts_at   timestamptz default now(),
  expires_at  timestamptz,
  is_active   boolean not null default true,
  is_featured boolean not null default false,
  is_automated boolean not null default false,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Defensive: the is_automated column was added in CP-20; older tables won't have it.
alter table public.offers
  add column if not exists is_automated boolean not null default false;

alter table public.offers enable row level security;

-- Recreate RLS policies idempotently. Drop-if-exists pattern keeps re-runs safe.
do $$ begin
  begin drop policy "offers_staff_write" on public.offers; exception when undefined_object then null; end;
  begin drop policy "offers_public_read" on public.offers; exception when undefined_object then null; end;
end $$;

create policy "offers_staff_write" on public.offers
  for all to authenticated
  using      (public.staffs_business(business_id))
  with check (public.staffs_business(business_id));

create policy "offers_public_read" on public.offers
  for select to anon, authenticated
  using (is_active and (expires_at is null or expires_at > now()));

-- Storage bucket for offer images — safe no-op if it already exists.
insert into storage.buckets (id, name, public)
values ('offer-images', 'offer-images', true)
on conflict (id) do nothing;

-- ----- 2. upsert_offer — drop + recreate so PostgREST sees it -----
-- Must DROP first because PostgREST caches the function by full argument
-- signature; CREATE OR REPLACE alone won't re-publish it.
drop function if exists public.upsert_offer(
  uuid, uuid, text, text, text, timestamptz, boolean, boolean
);

create or replace function public.upsert_offer(
  p_id           uuid,
  p_business_id  uuid,
  p_title        text,
  p_description  text default null,
  p_image_url    text default null,
  p_expires_at   timestamptz default null,
  p_is_active    boolean default true,
  p_is_featured  boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  -- Caller must staff the business they're editing.
  if not public.staffs_business(p_business_id) then
    raise exception 'permission denied';
  end if;

  -- Only one featured offer per business — un-feature any others when this
  -- one is being marked featured. The customer app reads featured_offer()
  -- which expects at most one row per business.
  if p_is_featured then
    update public.offers
       set is_featured = false
     where business_id = p_business_id
       and is_featured = true;
  end if;

  if p_id is null then
    insert into public.offers
      (business_id, title, description, image_url, expires_at, is_active, is_featured)
    values
      (p_business_id, p_title, p_description, p_image_url, p_expires_at, p_is_active, p_is_featured)
    returning id into v_id;
  else
    update public.offers
       set title       = p_title,
           description = p_description,
           image_url   = p_image_url,
           expires_at  = p_expires_at,
           is_active   = p_is_active,
           is_featured = p_is_featured,
           updated_at  = now()
     where id = p_id
       and business_id = p_business_id
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

grant execute on function public.upsert_offer(
  uuid, uuid, text, text, text, timestamptz, boolean, boolean
) to authenticated;

-- ----- 3. delete_offer — same drop+recreate pattern, called from the UI -----
drop function if exists public.delete_offer(uuid, uuid);

create or replace function public.delete_offer(
  p_id          uuid,
  p_business_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.staffs_business(p_business_id) then
    raise exception 'permission denied';
  end if;

  delete from public.offers
   where id = p_id
     and business_id = p_business_id;
end;
$$;

grant execute on function public.delete_offer(uuid, uuid) to authenticated;

-- ----- 4. Tell PostgREST to reload its schema cache -----
-- Without this, the API will keep returning "Could not find the function …
-- in the schema cache" even though we just created it.
notify pgrst, 'reload schema';
