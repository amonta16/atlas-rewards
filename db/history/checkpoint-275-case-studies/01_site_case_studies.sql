-- CP-275 · client results ("case studies") for the Results section on /medspa/app (Admin → Reviews & Results).
-- Each row is one clinic: big numbers, the owner's photo (or a YouTube interview), what they use.
-- Photos and logos live in the existing public `site-reviews` bucket under c/ (CP-240 made the bucket).
-- Safe to re-run.

create table if not exists public.site_case_studies (
  id            uuid primary key default gen_random_uuid(),
  clinic        text not null default '',
  headline      text not null default '',
  -- [{ "value": "+38%", "label": "Average patient spend" }, …] (the page shows the first two)
  stats         jsonb not null default '[]'::jsonb,
  -- what the clinic uses: memberships, rewards, recall, shop, push
  uses          text[] not null default array['memberships','rewards']::text[],
  photo_path    text,
  photo_url     text,
  logo_path     text,
  logo_url      text,
  youtube       text,
  active        boolean not null default false,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id) on delete set null,
  constraint site_case_studies_uses_check check (uses <@ array['memberships','rewards','recall','shop','push']::text[]),
  constraint site_case_studies_stats_check check (jsonb_typeof(stats) = 'array')
);

create index if not exists site_case_studies_order_idx on public.site_case_studies (sort_order, created_at);

-- Only the service role touches this table (the API routes check agency_admin), same as site_review_images.
alter table public.site_case_studies enable row level security;
revoke all on public.site_case_studies from anon, authenticated;
