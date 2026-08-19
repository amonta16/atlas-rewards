-- =====================================================================
-- CP-99 · Phase 3a — REWARD MULTI-IMAGE (roadmap item #2)
-- =====================================================================
-- Apply in the Supabase SQL editor AFTER cp99_2_raffle_lifecycle.sql.
-- Idempotent.
--
-- DATA MODEL (chosen for zero breakage):
--   • rewards.image_url stays EXACTLY as-is = the COVER image. Every
--     legacy surface (store cards, prize-wheel wedges, front-desk scan
--     panel, phone previews, Home grid tiles) keeps reading it and never
--     changes behavior.
--   • NEW rewards.images (jsonb array of urls) = ADDITIONAL photos only.
--     Customer detail views render [image_url, ...images] as a swipe
--     carousel. Rewards without extra photos (images null/empty) render
--     the single image pixel-identically to today.
--
-- upsert_reward: old 11-arg signature DROPPED, new 12-arg (+p_images)
-- created — single signature avoids PostgREST overload ambiguity. All
-- callers pass named args, so older client bundles that omit p_images
-- still resolve (default null = keep column untouched on insert; on
-- update, null clears extras only when explicitly passed... see note).
-- NOTE: p_images is written verbatim on update; the editor always sends
-- the full current array.
--
-- top_rewards_public: re-created (CP-87 base, verbatim) + images column
-- so the Home grid's detail popup can show the carousel.
-- =====================================================================

alter table public.rewards
  add column if not exists images jsonb;

-- ─────────────────────────────────────────────────────────────────────
-- upsert_reward — CP-87 definition + p_images
-- ─────────────────────────────────────────────────────────────────────
drop function if exists public.upsert_reward(uuid, uuid, text, text, text, int, text, boolean, int, text, boolean);

create or replace function public.upsert_reward(
  p_id            uuid,
  p_business_id   uuid,
  p_name          text,
  p_description   text default null,
  p_reward_type   text default 'discount',
  p_point_cost    int  default 500,
  p_image_url     text default null,
  p_is_active     boolean default true,
  p_sort_order    int default 0,
  p_category      text default null,
  p_show_in_store boolean default true,  -- CP-87: false = prize-only (wheel/streak/offers)
  p_images        jsonb default null     -- CP-99: ADDITIONAL photos (cover excluded)
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.staffs_business(p_business_id) then raise exception 'permission denied'; end if;

  if p_id is null then
    insert into public.rewards
      (business_id, name, description, reward_type, point_cost,
       image_url, is_active, sort_order, category, show_in_store, images)
    values
      (p_business_id, p_name, p_description, p_reward_type, p_point_cost,
       p_image_url, p_is_active, p_sort_order, p_category,
       coalesce(p_show_in_store, true), p_images)
    returning id into v_id;
  else
    update public.rewards
       set name          = p_name,
           description   = p_description,
           reward_type   = p_reward_type,
           point_cost    = p_point_cost,
           image_url     = p_image_url,
           is_active     = p_is_active,
           sort_order    = p_sort_order,
           category      = p_category,
           show_in_store = coalesce(p_show_in_store, true),
           images        = p_images,
           updated_at    = now()
     where id = p_id and business_id = p_business_id
    returning id into v_id;
  end if;

  return v_id;
end; $$;

grant execute on function public.upsert_reward(uuid, uuid, text, text, text, int, text, boolean, int, text, boolean, jsonb)
  to authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- top_rewards_public — CP-87 definition + images (return shape changes,
-- so drop + recreate)
-- ─────────────────────────────────────────────────────────────────────
drop function if exists public.top_rewards_public(uuid, int);

create or replace function public.top_rewards_public(p_business_id uuid, p_limit int default 4)
returns table (id uuid, name text, point_cost int, image_url text, images jsonb)
language sql stable security definer set search_path = public as $$
  select id, name, point_cost, image_url, images
    from public.rewards
   where business_id = p_business_id
     and is_active
     and coalesce(show_in_store, true)
   order by sort_order, point_cost asc
   limit p_limit;
$$;

grant execute on function public.top_rewards_public(uuid, int) to anon, authenticated;

notify pgrst, 'reload schema';
