-- =====================================================================
-- CHECKPOINT 14 — Schema additions:
--   * businesses.membership_image_url  (loyalty card art)
--   * news_posts table                 (per-business blog/news feed)
--   * RPCs for the news manager + customer reads
-- =====================================================================

-- ----- 1. Membership card art -----
alter table public.businesses
  add column if not exists membership_image_url text;

-- ----- 2. News posts -----
create table if not exists public.news_posts (
  id            uuid primary key default uuid_generate_v4(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  title         text not null,
  body          text,
  image_url     text,
  is_published  boolean not null default true,
  published_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists news_business_idx
  on public.news_posts(business_id, is_published, published_at desc);

alter table public.news_posts enable row level security;

do $$
begin
  begin drop policy "news_public_read" on public.news_posts; exception when undefined_object then null; end;
  begin drop policy "news_staff_write" on public.news_posts; exception when undefined_object then null; end;
end $$;

create policy "news_public_read" on public.news_posts for select to public
  using (is_published);
create policy "news_staff_write" on public.news_posts for all to authenticated
  using (public.staffs_business(business_id))
  with check (public.staffs_business(business_id));

-- ----- 3. RPCs -----
create or replace function public.upsert_news_post(
  p_id           uuid,
  p_business_id  uuid,
  p_title        text,
  p_body         text default null,
  p_image_url    text default null,
  p_is_published boolean default true,
  p_published_at timestamptz default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.staffs_business(p_business_id) then raise exception 'permission denied'; end if;

  if p_id is null then
    insert into public.news_posts (business_id, title, body, image_url, is_published, published_at)
    values (p_business_id, p_title, p_body, p_image_url, p_is_published, coalesce(p_published_at, now()))
    returning id into v_id;
  else
    update public.news_posts
       set title = p_title, body = p_body, image_url = p_image_url,
           is_published = p_is_published,
           published_at = coalesce(p_published_at, published_at),
           updated_at = now()
     where id = p_id and business_id = p_business_id
    returning id into v_id;
  end if;
  return v_id;
end; $$;
grant execute on function public.upsert_news_post(uuid, uuid, text, text, text, boolean, timestamptz) to authenticated;

create or replace function public.delete_news_post(p_id uuid, p_business_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.staffs_business(p_business_id) then raise exception 'permission denied'; end if;
  delete from public.news_posts where id = p_id and business_id = p_business_id;
end; $$;
grant execute on function public.delete_news_post(uuid, uuid) to authenticated;

-- Customer-side: latest published posts (for Home tab)
create or replace function public.latest_news(p_business_id uuid, p_limit int default 5)
returns table (id uuid, title text, body text, image_url text, published_at timestamptz)
language sql stable security definer set search_path = public as $$
  select id, title, body, image_url, published_at
    from public.news_posts
   where business_id = p_business_id and is_published
   order by published_at desc
   limit p_limit;
$$;
grant execute on function public.latest_news(uuid, int) to anon, authenticated;

-- ----- 4. Top rewards (for customer Home preview) -----
create or replace function public.top_rewards_public(p_business_id uuid, p_limit int default 4)
returns table (id uuid, name text, point_cost int, image_url text)
language sql stable security definer set search_path = public as $$
  select id, name, point_cost, image_url
    from public.rewards
   where business_id = p_business_id and is_active
   order by sort_order, point_cost asc
   limit p_limit;
$$;
grant execute on function public.top_rewards_public(uuid, int) to anon, authenticated;

-- ----- 5. Update upsert_business to allow membership_image_url + hero -----
-- (handled by the brand-editor save() which writes directly with RLS; no RPC needed)
