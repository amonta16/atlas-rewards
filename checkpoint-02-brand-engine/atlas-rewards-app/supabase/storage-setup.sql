-- Run this in Supabase SQL Editor to create the storage bucket for business logos.
-- This is a tiny add-on to CP 1 — keeps the schema and storage layers in sync.

insert into storage.buckets (id, name, public)
values ('business-logos', 'business-logos', true)
on conflict (id) do nothing;

-- Agency admins can upload/replace any logo; managers can upload to their own business folder.
create policy if not exists "Agency admins manage logos"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'business-logos' and exists (
      select 1 from public.business_users
      where user_id = auth.uid() and role = 'agency_admin'
    )
  );

create policy if not exists "Public read on logos"
  on storage.objects for select
  to public
  using (bucket_id = 'business-logos');
