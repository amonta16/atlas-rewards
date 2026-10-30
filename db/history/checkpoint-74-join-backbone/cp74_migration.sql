-- ============================================================
-- CP-74: Join backbone — business join codes for the mobile app
-- Run in Supabase SQL editor. Safe to re-run.
--
--  1. businesses.join_code — short, human-typeable, unique code
--  2. Backfill from slug (FLIPPOS-ARCADE → FLIPPOSARCADE, capped 12 chars)
--  3. Trigger: every new business gets a code automatically
--  4. join_business_by_code(p_code) — anon-callable RPC that returns
--     ONLY public branding fields (no PII, no config) so the pre-join
--     screen and /j/<code> landing can show the branded confirmation.
-- ============================================================

-- 1) Column ---------------------------------------------------
alter table public.businesses
  add column if not exists join_code text;

-- Case-insensitive uniqueness (codes are stored uppercase anyway,
-- but this makes the guarantee structural).
create unique index if not exists businesses_join_code_ci_key
  on public.businesses (upper(join_code));

-- 2) Backfill existing businesses -----------------------------
do $$
declare
  b record;
  base text;
  candidate text;
  n int;
begin
  for b in
    select id, slug from public.businesses
    where join_code is null
  loop
    base := upper(regexp_replace(coalesce(b.slug, ''), '[^a-zA-Z0-9]', '', 'g'));
    base := substr(base, 1, 12);
    if base = '' then base := 'ATLAS'; end if;

    candidate := base;
    n := 1;
    while exists (
      select 1 from public.businesses
      where upper(join_code) = upper(candidate) and id <> b.id
    ) loop
      n := n + 1;
      candidate := substr(base, 1, 10) || n::text;
    end loop;

    update public.businesses set join_code = candidate where id = b.id;
  end loop;
end $$;

-- 3) Auto-assign on insert ------------------------------------
create or replace function public.assign_join_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base text;
  candidate text;
  n int;
begin
  if new.join_code is not null and new.join_code <> '' then
    new.join_code := upper(regexp_replace(new.join_code, '[^a-zA-Z0-9]', '', 'g'));
    return new;
  end if;

  base := upper(regexp_replace(coalesce(new.slug, ''), '[^a-zA-Z0-9]', '', 'g'));
  base := substr(base, 1, 12);
  if base = '' then base := 'ATLAS'; end if;

  candidate := base;
  n := 1;
  while exists (
    select 1 from public.businesses where upper(join_code) = upper(candidate)
  ) loop
    n := n + 1;
    candidate := substr(base, 1, 10) || n::text;
  end loop;

  new.join_code := candidate;
  return new;
end $$;

drop trigger if exists trg_assign_join_code on public.businesses;
create trigger trg_assign_join_code
  before insert on public.businesses
  for each row execute function public.assign_join_code();

-- 4) Public lookup RPC ----------------------------------------
-- Returns branding ONLY. Deliberately excludes point_rules, contact
-- email internals, config, etc. Anon-callable: this is what the
-- pre-join "Enter code" screen and /j/<code> landing hit before the
-- customer has any account.
create or replace function public.join_business_by_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_clean text;
  v record;
begin
  v_clean := upper(regexp_replace(coalesce(p_code, ''), '[^a-zA-Z0-9]', '', 'g'));
  if v_clean = '' or length(v_clean) > 24 then
    return jsonb_build_object('found', false);
  end if;

  select id, slug, name, join_code, logo_url, app_icon_url, hero_image_url, brand_colors, header_color
    into v
    from public.businesses
   where upper(join_code) = v_clean
   limit 1;

  if v.id is null then
    return jsonb_build_object('found', false);
  end if;

  return jsonb_build_object(
    'found',         true,
    'slug',          v.slug,
    'name',          v.name,
    'join_code',     v.join_code,
    'logo_url',      v.logo_url,
    'app_icon_url',  v.app_icon_url,
    'hero_image_url',v.hero_image_url,
    'brand_colors',  v.brand_colors,
    'header_color',  v.header_color
  );
end $$;

grant execute on function public.join_business_by_code(text) to anon, authenticated;
