-- =====================================================================
-- CHECKPOINT 15 — Widget config expansion + industry templates
-- =====================================================================
-- Adds five new widget flags (booking, shop, shop_pickup, shop_delivery,
-- news) to every existing business by jsonb-merging defaults. Existing
-- toggles are preserved.
-- =====================================================================

-- ----- 1. Add new flags to every existing business -----
update public.businesses
   set widget_config = jsonb_build_object(
         'booking',         false,
         'shop',            false,
         'shop_pickup',     false,
         'shop_delivery',   false,
         'news',            false
       ) || widget_config
 where not (
         widget_config ? 'booking'
     and widget_config ? 'shop'
     and widget_config ? 'shop_pickup'
     and widget_config ? 'shop_delivery'
     and widget_config ? 'news'
       );

-- ----- 2. Update the column default for any future inserts -----
-- (We keep all new flags false so businesses opt in via template/toggle.)
alter table public.businesses
  alter column widget_config set default '{
    "points_card": true,
    "rewards_store": true,
    "referrals": true,
    "reviews": true,
    "birthdays": true,
    "visit_tracker": true,
    "booking_cta": false,
    "offers": true,
    "leaderboard": false,
    "push": true,
    "sms": true,
    "booking": false,
    "shop": false,
    "shop_pickup": false,
    "shop_delivery": false,
    "news": false
  }'::jsonb;

-- ----- 3. Allow create_business to accept a widget_config + point_rules override -----
-- (Used by the new-business modal when the agency picks a template at creation time.)
create or replace function public.create_business(
  p_name           text,
  p_slug           text,
  p_industry       text     default null,
  p_widget_config  jsonb    default null,
  p_point_rules    jsonb    default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id   uuid;
  v_slug citext := lower(regexp_replace(p_slug, '[^a-z0-9-]+', '-', 'gi'));
begin
  if not public.is_agency_admin() then
    raise exception 'only agency admins can create businesses';
  end if;
  if v_slug = '' or length(v_slug) < 2 then
    raise exception 'slug must be at least 2 characters';
  end if;
  if exists (select 1 from public.businesses where slug = v_slug) then
    raise exception 'slug "%" is already taken', v_slug;
  end if;

  insert into public.businesses (slug, name, industry, status, widget_config, point_rules)
       values (
         v_slug, p_name, p_industry, 'active',
         coalesce(p_widget_config,
           (select column_default::jsonb from information_schema.columns
             where table_schema = 'public' and table_name = 'businesses'
               and column_name = 'widget_config')),
         coalesce(p_point_rules,
           (select column_default::jsonb from information_schema.columns
             where table_schema = 'public' and table_name = 'businesses'
               and column_name = 'point_rules'))
       )
    returning id into v_id;

  return v_id;
end; $$;
grant execute on function public.create_business(text, text, text, jsonb, jsonb) to authenticated;

-- Keep the old 3-arg signature working too (older clients calling without overrides)
create or replace function public.create_business(
  p_name      text,
  p_slug      text,
  p_industry  text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  return public.create_business(p_name, p_slug, p_industry, null::jsonb, null::jsonb);
end; $$;
grant execute on function public.create_business(text, text, text) to authenticated;
