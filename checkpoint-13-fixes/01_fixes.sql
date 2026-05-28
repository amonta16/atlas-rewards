-- =====================================================================
-- CP 13 — Fix patches: logo bucket, offers table, offer image bucket
-- =====================================================================

-- ----- 1. LOGO BUCKET FIX (definitive) -----
-- Recreate the bucket if missing
insert into storage.buckets (id, name, public) values ('business-logos', 'business-logos', true)
  on conflict (id) do nothing;

-- Drop + recreate policies cleanly
do $$
begin
  begin drop policy "Agency admins manage logos" on storage.objects; exception when undefined_object then null; end;
  begin drop policy "Public read on logos"       on storage.objects; exception when undefined_object then null; end;
end $$;

create policy "Agency admins manage logos" on storage.objects for all to authenticated
  using (bucket_id = 'business-logos' and exists (
    select 1 from public.business_users where user_id = auth.uid() and role = 'agency_admin'
  ))
  with check (bucket_id = 'business-logos' and exists (
    select 1 from public.business_users where user_id = auth.uid() and role = 'agency_admin'
  ));
create policy "Public read on logos" on storage.objects for select to public
  using (bucket_id = 'business-logos');

-- ----- 2. OFFER IMAGES BUCKET -----
insert into storage.buckets (id, name, public) values ('offer-images', 'offer-images', true)
  on conflict (id) do nothing;

do $$
begin
  begin drop policy "Agency manages offer images" on storage.objects; exception when undefined_object then null; end;
  begin drop policy "Public read offer images"    on storage.objects; exception when undefined_object then null; end;
end $$;

create policy "Agency manages offer images" on storage.objects for all to authenticated
  using (bucket_id = 'offer-images' and exists (
    select 1 from public.business_users where user_id = auth.uid() and role = 'agency_admin'
  ))
  with check (bucket_id = 'offer-images' and exists (
    select 1 from public.business_users where user_id = auth.uid() and role = 'agency_admin'
  ));
create policy "Public read offer images" on storage.objects for select to public
  using (bucket_id = 'offer-images');

-- ----- 3. OFFERS TABLE -----
create table if not exists public.offers (
  id            uuid primary key default uuid_generate_v4(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  title         text not null,
  description   text,
  image_url     text,
  starts_at     timestamptz default now(),
  expires_at    timestamptz,
  is_active     boolean not null default true,
  is_featured   boolean not null default false,
  sort_order    int     not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists offers_business_idx on public.offers(business_id, is_active, is_featured);

alter table public.offers enable row level security;

do $$
begin
  begin drop policy "offers_public_read" on public.offers; exception when undefined_object then null; end;
  begin drop policy "offers_staff_write" on public.offers; exception when undefined_object then null; end;
end $$;

create policy "offers_public_read" on public.offers for select to public
  using (is_active and (expires_at is null or expires_at > now()));
create policy "offers_staff_write" on public.offers for all to authenticated
  using (public.staffs_business(business_id))
  with check (public.staffs_business(business_id));

-- ----- 4. OFFERS RPCs -----
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
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.staffs_business(p_business_id) then raise exception 'permission denied'; end if;

  -- Only one featured offer per business (un-feature others if this one is featured)
  if p_is_featured then
    update public.offers set is_featured = false where business_id = p_business_id and is_featured = true;
  end if;

  if p_id is null then
    insert into public.offers (business_id, title, description, image_url, expires_at, is_active, is_featured)
    values (p_business_id, p_title, p_description, p_image_url, p_expires_at, p_is_active, p_is_featured)
    returning id into v_id;
  else
    update public.offers
       set title = p_title, description = p_description, image_url = p_image_url,
           expires_at = p_expires_at, is_active = p_is_active, is_featured = p_is_featured,
           updated_at = now()
     where id = p_id and business_id = p_business_id
    returning id into v_id;
  end if;
  return v_id;
end; $$;
grant execute on function public.upsert_offer(uuid, uuid, text, text, text, timestamptz, boolean, boolean) to authenticated;

create or replace function public.delete_offer(p_id uuid, p_business_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.staffs_business(p_business_id) then raise exception 'permission denied'; end if;
  delete from public.offers where id = p_id and business_id = p_business_id;
end; $$;
grant execute on function public.delete_offer(uuid, uuid) to authenticated;

-- Customer-facing: get the featured offer for the sticky banner
create or replace function public.featured_offer(p_business_id uuid)
returns table (id uuid, title text, description text, image_url text, expires_at timestamptz)
language sql stable security definer set search_path = public as $$
  select o.id, o.title, o.description, o.image_url, o.expires_at
    from public.offers o
   where o.business_id = p_business_id
     and o.is_active
     and o.is_featured
     and (o.expires_at is null or o.expires_at > now())
   order by o.sort_order, o.created_at desc
   limit 1;
$$;
grant execute on function public.featured_offer(uuid) to anon, authenticated;
