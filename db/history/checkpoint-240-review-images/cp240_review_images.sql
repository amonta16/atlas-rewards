-- CP-240 · review screenshots for the marketing sites and funnels (Admin → Reviews).
-- Safe to re-run.

create table if not exists public.site_review_images (
  id            uuid primary key default gen_random_uuid(),
  storage_path  text not null unique,
  url           text not null,
  width         int,
  height        int,
  alt           text not null default '',
  show_on       text[] not null default array['medspa','general']::text[],
  active        boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id) on delete set null,
  constraint site_review_images_show_on_check check (show_on <@ array['medspa','general','venues']::text[])
);

create index if not exists site_review_images_order_idx on public.site_review_images (sort_order, created_at);

-- Only the service role touches this table (the API routes check agency_admin).
alter table public.site_review_images enable row level security;
revoke all on public.site_review_images from anon, authenticated;

-- Public bucket: the sites load the images straight from storage. Uploads go
-- through signed upload URLs minted by /api/agency/site-reviews (admins only),
-- so no insert/update/delete policies are needed on storage.objects.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-reviews', 'site-reviews', true, 8388608, array['image/png','image/jpeg','image/webp','image/gif','image/avif'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
